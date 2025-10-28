import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

const width = 1000;
const height = 600;
const backgroundColour = 'white';

function toLineDataset(candles) {
  return candles.map((c, i) => ({ x: i, y: c.close }));
}

export async function drawCandlestickChart({ candles, zone, symbol, subtitle }) {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour });
  const cfg = {
    type: 'line',
    data: {
      datasets: [
        {
          label: `${symbol} Close`,
          borderColor: 'rgba(0,0,0,0)',
          pointRadius: 0,
          borderWidth: 1,
          data: toLineDataset(candles),
          parsing: false
        }
      ]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', ticks: { color: '#111827' }, grid: { color: '#e5e7eb' } },
        y: { ticks: { color: '#111827' }, grid: { color: '#e5e7eb' } }
      },
      plugins: {
        title: { display: true, text: `${symbol} ${subtitle || ''}`.trim() },
        legend: { display: false }
      }
    },
    plugins: [{
      id: 'zoneDrawer',
      afterDraw: (chart) => {
        if (!zone) return;
        const { ctx, scales } = chart;
        const y1 = scales.y.getPixelForValue(zone.from);
        const y2 = scales.y.getPixelForValue(zone.to);
        const top = Math.min(y1, y2);
        const heightPx = Math.abs(y2 - y1);
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(scales.x.left, top, scales.x.right - scales.x.left, heightPx);
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 1;
        ctx.strokeRect(scales.x.left, top, scales.x.right - scales.x.left, heightPx);
        ctx.restore();
      }
    },{
      id: 'candlePainter',
      afterDatasetsDraw: (chart) => {
        const { ctx, scales } = chart;
        const xScale = scales.x;
        const yScale = scales.y;
        const plotWidth = xScale.right - xScale.left;
        const cw = Math.max(2, Math.min(12, (plotWidth / Math.max(10, candles.length)) * 0.7));
        for (let i = 0; i < candles.length; i++) {
          const c = candles[i];
          const x = xScale.getPixelForValue(i);
          const open = yScale.getPixelForValue(c.open);
          const high = yScale.getPixelForValue(c.high);
          const low = yScale.getPixelForValue(c.low);
          const close = yScale.getPixelForValue(c.close);
          const up = c.close >= c.open;
          const color = up ? '#16a34a' : '#dc2626';
          ctx.save();
          ctx.strokeStyle = color;
          ctx.fillStyle = color + 'bb';
          ctx.lineWidth = 1;
          // wick
          ctx.beginPath();
          ctx.moveTo(x, high);
          ctx.lineTo(x, low);
          ctx.stroke();
          // body
          const top = Math.min(open, close);
          const bottom = Math.max(open, close);
          const h = Math.max(1, bottom - top);
          ctx.fillRect(x - cw / 2, top, cw, h);
          ctx.restore();
        }
      }
    },{
      id: 'watermark',
      afterDraw: (chart) => {
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 72px sans-serif';
        const text = `${symbol}${subtitle ? ', ' + subtitle : ''}`;
        ctx.fillText(text, (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2);
        ctx.restore();
      }
    }]
  };

  return chartJSNodeCanvas.renderToBuffer(cfg);
}


