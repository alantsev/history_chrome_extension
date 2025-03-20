import { UMAP } from 'umap-js';
import { PageDatabase } from '../db/database.js';
import * as d3 from 'd3';

function cosineDistance(a, b) {
  // Compute dot product
  let dotProduct = 0;
  // Compute magnitudes
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    aMagnitude += a[i] * a[i];
    bMagnitude += b[i] * b[i];
  }

  aMagnitude = Math.sqrt(aMagnitude);
  bMagnitude = Math.sqrt(bMagnitude);

  // Prevent division by zero
  if (aMagnitude === 0 || bMagnitude === 0) return 1.0;

  // Cosine similarity (1 - similarity = distance)
  const similarity = dotProduct / (aMagnitude * bMagnitude);
  return 1.0 - similarity;
}

async function getSearchEmbeddings(text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'GENERATE_EMBEDDINGS',
      data: { text }
    }, response => {
      if (response && response.status === 'success') {
        resolve(response.embeddings);
      } else {
        reject(new Error(response?.error || 'Failed to generate embeddings'));
      }
    });
  });
}

class VisualisationView {
  constructor() {
    this.db = new PageDatabase();
    this.svg = null;
    this.zoom = null;
    this.container = null;
    this.width = 0;
    this.height = 0;
    this.margin = { top: 50, right: 50, bottom: 50, left: 50 };
    this.reducedData = null;
    this.metadata = null;
    this.xScale = null;
    this.yScale = null;
    this.umap = null;
    this.searchResult = null;
    this.embeddings = null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    try {
      this.container = document.getElementById('plot');
      // First, calculate UMAP projection once
      await this.calculateUMAP();
      // Then, set up the visualization
      this.setupVisualization();
      this.setupResizeListener();
      this.setupZoomControls();
      this.setupSearchControls();
    } catch (error) {
      this.container.innerHTML = `<div class="error">Error loading data: ${error.message}</div>`;
      console.error(error);
    }
  }

  setupResizeListener() {
    window.addEventListener('resize', this.debounce(() => {
      if (this.svg) {
        d3.select('#plot svg').remove();
        this.setupVisualization();
      }
    }, 250));
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  setupZoomControls() {
    document.getElementById('zoom-in').addEventListener('click', () => {
      this.zoomBy(1.3);
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
      this.zoomBy(0.7);
    });

    document.getElementById('reset-zoom').addEventListener('click', () => {
      this.resetZoom();
    });
  }

  zoomBy(factor) {
    const transform = d3.zoomTransform(this.svg.node());
    this.svg.call(this.zoom.transform,
      d3.zoomIdentity
        .translate(transform.x, transform.y)
        .scale(transform.k * factor)
    );
  }

  resetZoom() {
    this.svg.call(this.zoom.transform, d3.zoomIdentity);
  }

  async calculateUMAP() {
    const pages = await this.db.getAllPages();

    // Extract embeddings and metadata
    this.embeddings = pages.map(p => p.embeddings);
    this.metadata = pages.map(p => ({
      url: p.url,
      timestamp: p.timestamp
    }));

    // Configure UMAP
    this.umap = new UMAP({
      nComponents: 2,
      nNeighbors: 8,
      minDist: 0.1,
      distanceFn: cosineDistance
    });

    // Reduce dimensions - only do this once
    this.reducedData = this.umap.fit(this.embeddings);
  }

  setupVisualization() {
    // Update dimensions based on current container size
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    // Create SVG
    this.svg = d3.select('#plot')
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Create a group for all visualization elements
    const g = this.svg.append('g');

    // Find the data extent for both dimensions
    const xExtent = d3.extent(this.reducedData, d => d[0]);
    const yExtent = d3.extent(this.reducedData, d => d[1]);

    // Calculate the range for each dimension
    const xRange = xExtent[1] - xExtent[0];
    const yRange = yExtent[1] - yExtent[0];

    // Determine the available space
    const availableWidth = this.width - this.margin.left - this.margin.right;
    const availableHeight = this.height - this.margin.top - this.margin.bottom;

    // Calculate the scale to maintain aspect ratio
    const scale = Math.min(
      availableWidth / xRange,
      availableHeight / yRange
    );

    // Calculate centered positioning
    const xMid = (xExtent[0] + xExtent[1]) / 2;
    const yMid = (yExtent[0] + yExtent[1]) / 2;

    const scaledWidth = xRange * scale;
    const scaledHeight = yRange * scale;

    const xOffset = this.margin.left + (availableWidth - scaledWidth) / 2;
    const yOffset = this.margin.top + (availableHeight - scaledHeight) / 2;

    // Create scales with equal scaling factors
    this.xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([xOffset, xOffset + scaledWidth]);

    this.yScale = d3.scaleLinear()
      .domain(yExtent)
      .range([yOffset + scaledHeight, yOffset]); // Flip Y axis

    // Setup zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([1.0 / 25, 25])
      .on('zoom', (event) => {
        // Apply the same transform to both axes
        g.attr('transform', event.transform);

        // Adjust circle radius to maintain visual size during zoom
        g.selectAll('circle')
          .attr('r', 4 / event.transform.k);

        // When a point is active (hovered), keep its highlight size proportional
        g.selectAll('circle.active')
          .attr('r', 5 / event.transform.k);

        // Update tooltip position on zoom
        const active = d3.select('.point.active').node();
        if (active) {
          if (d3.select(active).classed('search-result') && this.searchResult) {
            const [x, y] = [this.xScale(this.searchResult.projection[0]), this.yScale(this.searchResult.projection[1])];
            const transformed = event.transform.apply([x, y]);
            this.updateSearchTooltip(this.searchResult.text, transformed[0], transformed[1]);
          } else {
            const i = d3.select(active).datum() ? this.reducedData.indexOf(d3.select(active).datum()) : -1;
            if (i >= 0) {
              const [x, y] = [this.xScale(this.reducedData[i][0]), this.yScale(this.reducedData[i][1])];
              const transformed = event.transform.apply([x, y]);
              this.updateTooltip(this.metadata[i], transformed[0], transformed[1]);
            }
          }
        }
      });

    // Apply zoom behavior to SVG
    this.svg.call(this.zoom);

    // Add points
    g.selectAll('circle')
      .data(this.reducedData)
      .enter()
      .append('circle')
      .attr('class', 'point')
      .attr('cx', d => this.xScale(d[0]))
      .attr('cy', d => this.yScale(d[1]))
      .attr('r', 4)
      .attr('fill', 'steelblue')
      .attr('fill-opacity', 0.4) // Add semi-transparency
      .on('mouseover', (event, d) => {
        const i = this.reducedData.indexOf(d);
        const transform = d3.zoomTransform(this.svg.node());

        d3.select(event.target)
          .classed('active', true)
          .attr('r', 5 / transform.k)  // Adjust highlight size based on zoom
          .attr('fill-opacity', 1);    // Make fully opaque on hover

        // Get transformed coordinates
        const [x, y] = transform.apply([this.xScale(d[0]), this.yScale(d[1])]);

        this.updateTooltip(this.metadata[i], x, y);
      })
      .on('mouseout', (event) => {
        const transform = d3.zoomTransform(this.svg.node());

        d3.select(event.target)
          .classed('active', false)
          .attr('r', 4 / transform.k)  // Reset to normal size based on zoom
          .attr('fill-opacity', 0.4);  // Reset to semi-transparent

        d3.select('#tooltip').style('opacity', 0);
      })
      .on('click', (event, d) => {
        const i = this.reducedData.indexOf(d);
        const url = this.metadata[i].url;
        // Open in new tab
        window.open(url, '_blank');
      });
  }

  updateTooltip(data, x, y) {
    d3.select('#tooltip')
      .style('opacity', 1)
      .html(`
        <strong>URL:</strong> ${data.url}<br>
        <strong>Date:</strong> ${new Date(data.timestamp).toLocaleString()}
      `)
      .style('left', (x + 30) + 'px')
      .style('top', (y - 10) + 'px');
  }

  updateSearchTooltip(text, x, y) {
    d3.select('#tooltip')
      .style('opacity', 1)
      .html(`
        <strong>Search:</strong> ${text}<br>
        <strong>Date:</strong> ${new Date().toLocaleString()}
      `)
      .style('left', (x + 30) + 'px')
      .style('top', (y - 10) + 'px');
  }

  setupSearchControls() {
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');

    searchButton.addEventListener('click', () => this.handleSearch(searchInput.value));
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleSearch(searchInput.value);
      }
    });
  }

  async handleSearch(text) {
    if (!text.trim()) return;

    try {
      // Show loading indicator
      const searchButton = document.getElementById('search-button');
      const originalButtonText = searchButton.textContent;
      searchButton.textContent = 'Loading...';
      searchButton.disabled = true;

      // Get embeddings for the search text using our service
      const searchEmbedding = await getSearchEmbeddings(text);

      // Project the search embedding to the UMAP space
      const searchProjection = this.umap.transform([searchEmbedding])[0];

      // Update the visualization with the search result
      this.updateSearchResult(searchProjection, text);

      // Reset button
      searchButton.textContent = originalButtonText;
      searchButton.disabled = false;
    } catch (error) {
      console.error('Error processing search:', error);
      alert('Error processing search. Please try again.');

      // Reset button on error too
      const searchButton = document.getElementById('search-button');
      searchButton.textContent = 'Search';
      searchButton.disabled = false;
    }
  }

  updateSearchResult(projection, text) {
    // Remove previous search result if it exists
    d3.selectAll('#search-result').remove();

    // Store the search result
    this.searchResult = {
      projection: projection,
      text: text
    };

    // Get the current transform
    const transform = d3.zoomTransform(this.svg.node());

    // Add the search result as a red dot
    const g = this.svg.select('g');
    g.append('circle')
      .attr('class', 'point')
      .attr('id', 'search-result')
      .attr('cx', this.xScale(projection[0]))
      .attr('cy', this.yScale(projection[1]))
      .attr('r', 4 / transform.k)  // Slightly larger than regular points
      .attr('fill', 'red')
      .on('mouseover', (event) => {
        const transform = d3.zoomTransform(this.svg.node());
        const [x, y] = transform.apply([this.xScale(projection[0]), this.yScale(projection[1])]);

        d3.select(event.target)
          .classed('active', true)
          .attr('r', 5 / transform.k);  // Adjust highlight size based on zoom

        this.updateSearchTooltip(text, x, y);
      })
      .on('mouseout', (event) => {
        const transform = d3.zoomTransform(this.svg.node());
        d3.select(event.target)
          .classed('active', false)
          .attr('r', 4 / transform.k);  // Reset to normal size based on zoom

        d3.select('#tooltip').style('opacity', 0);
      });
  }

}

new VisualisationView();

