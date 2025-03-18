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

class VisualisationView {
  constructor() {
    this.db = new PageDatabase();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    try {
      await this.visualiseEmbeddings();
    } catch (error) {
      this.container.innerHTML = `<div class="error">Error loading data: ${error.message}</div>`;
    }
  }

  async visualiseEmbeddings() {
    const pages = await this.db.getAllPages();

    // Extract embeddings and metadata
    const embeddings = pages.map(p => p.embeddings);
    const metadata = pages.map(p => ({
      url: p.url,
      timestamp: p.timestamp
    }));

    // Configure UMAP
    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: 8,
      minDist: 0.5,
      distanceFn: cosineDistance
    });

    // Reduce dimensions
    const reduced = umap.fit(embeddings);

    // Visualize with D3
    const svg = d3.select('#plot')
      .append('svg')
      .attr('width', 800)
      .attr('height', 600);

    // Create scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(reduced, d => d[0]))
      .range([50, 750]);

    const yScale = d3.scaleLinear()
      .domain(d3.extent(reduced, d => d[1]))
      .range([550, 50]);

    // Add points
    svg.selectAll('circle')
      .data(reduced)
      .enter()
      .append('circle')
      .attr('class', 'point')
      .attr('cx', d => xScale(d[0]))
      .attr('cy', d => yScale(d[1]))
      .attr('r', 5)
      .attr('fill', 'steelblue')
      .on('mouseover', function(event, d) {
        const i = d3.select(this).datum() ? reduced.indexOf(d) : -1;
        const tooltip = d3.select('#tooltip');
        tooltip.style('opacity', 1)
          .html(`
                <strong>URL:</strong> ${metadata[i].url}<br>
                <strong>Date:</strong> ${new Date(metadata[i].timestamp).toLocaleString()}
            `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', () => {
        d3.select('#tooltip').style('opacity', 0);
      });
  }
}

new VisualisationView();

