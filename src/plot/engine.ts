import { Environment, GraphSpec } from '../core/types';
import { Canvas2DPlotter } from './canvas2d';
import { HeatmapPlotter } from './heatmap';
import { Surface3DPlotter } from './surface3d';

export class GraphPlotEngine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private spec: GraphSpec;
  private env: Environment;
  private currentMode: 'heatmap' | 'surface' = 'heatmap';

  constructor(container: HTMLElement, spec: GraphSpec, env: Environment) {
    this.container = container;
    this.spec = spec;
    this.env = env;
    this.container.innerHTML = '';
    this.container.className = 'graph-container';

    if (this.spec.dimensionality === 2) {
      this.create2DControls();
    }

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plot-canvas';
    this.container.appendChild(this.canvas);

    this.render();
  }

  private create2DControls(): void {
    const controls = document.createElement('div');
    controls.className = 'plot-controls-bar';

    const btnHeatmap = document.createElement('button');
    btnHeatmap.className = 'plot-btn active';
    btnHeatmap.textContent = 'Heatmap';

    const btnSurface = document.createElement('button');
    btnSurface.className = 'plot-btn';
    btnSurface.textContent = '3D Surface';

    btnHeatmap.onclick = () => {
      this.currentMode = 'heatmap';
      btnHeatmap.classList.add('active');
      btnSurface.classList.remove('active');
      this.render();
    };

    btnSurface.onclick = () => {
      this.currentMode = 'surface';
      btnSurface.classList.add('active');
      btnHeatmap.classList.remove('active');
      this.render();
    };

    controls.appendChild(btnHeatmap);
    controls.appendChild(btnSurface);
    this.container.appendChild(controls);
  }

  public render(): void {
    if (this.spec.dimensionality === 2) {
      if (this.currentMode === 'heatmap') {
        new HeatmapPlotter(this.canvas, this.spec, this.env).render();
      } else {
        new Surface3DPlotter(this.canvas, this.spec, this.env).render();
      }
    } else {
      new Canvas2DPlotter(this.canvas, this.spec, this.env).render();
    }
  }
}
