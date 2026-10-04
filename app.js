(function (root) {
  'use strict';
  const CLASS_NAMES = ['Vitória das brancas', 'Empate', 'Vitória das pretas'];
  const SHORT_NAMES = ['BRANCAS', 'EMPATE', 'PRETAS'];
  const number = value => value.toFixed(1).replace('.', ',');
  const percentage = value => value > 0 && value < 0.0005 ? '<0,1%' : value < 1 && value > 0.9995 ? '>99,9%' : number(value * 100) + '%';
  const xmlText = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function featureVector(white, black, model) {
    const d = (white - black) / model.scale.diff_divisor;
    const m = ((white + black) / 2 - model.scale.mean_center) / model.scale.mean_divisor;
    return [1, d, m, d * d, m * m, d * m];
  }
  function softmax(features, coefficients) {
    const dot = beta => beta.reduce((sum, value, i) => sum + value * features[i], 0);
    const eta = [dot(coefficients[0]), 0, dot(coefficients[1])];
    const shift = Math.max(...eta);
    const values = eta.map(value => Math.exp(value - shift));
    const total = values.reduce((sum, value) => sum + value, 0);
    return values.map(value => value / total);
  }
  function quantile(sortedValues, q) {
    const position = (sortedValues.length - 1) * q;
    const lower = Math.floor(position), upper = Math.ceil(position);
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
  }
  function compute(white, black, model) {
    if (!Number.isInteger(white) || !Number.isInteger(black) || white < 1500 || black < 1500 || white > 3000 || black > 3000) {
      throw new RangeError('Digite dois ratings inteiros de 1500 a 3000.');
    }
    const features = featureVector(white, black, model);
    const probabilities = softmax(features, model.coefficients);
    const samples = [[], [], []];
    for (const coefficients of model.bootstrap) {
      const p = softmax(features, coefficients);
      p.forEach((value, i) => samples[i].push(value));
    }
    const intervals = samples.map(values => {
      values.sort((a, b) => a - b);
      return [quantile(values, 0.025), quantile(values, 0.975)];
    });
    return {white, black, probabilities, intervals, extrapolation:Math.max(white, black) > model.observedMax};
  }

  // Os segmentos preservam rigorosamente as probabilidades. Somente os
  // rótulos se afastam quando necessário; linhas-guia mantêm a associação.
  function chartLayout(result, width) {
    const w = Math.max(250, width), mobile = w < 500;
    const intervalFont = mobile ? 13 : 14;
    const splitIntervals = w < 310;
    const estimates = result.probabilities.map(percentage);
    const probabilityFont = mobile ? Math.min(22, (w - 24) / (estimates.reduce((sum, text) => sum + text.length, 0) * 0.72)) : 24;
    const titleFont = mobile ? 10 : 11;
    const edge = 3, gap = mobile ? 5 : 14;
    const intervalTexts = result.intervals.map(([lo, hi]) => '(' + number(lo * 100) + '; ' + number(hi * 100) + ')');
    const intervalLines = result.intervals.map(([lo, hi], i) => splitIntervals ? ['(' + number(lo * 100) + ';', number(hi * 100) + ')'] : [intervalTexts[i]]);
    const labelWidths = intervalLines.map((lines, i) => Math.max(...lines.map(s => s.length * intervalFont * 0.63), estimates[i].length * probabilityFont * 0.72, SHORT_NAMES[i].length * titleFont * 0.68));
    let cumulative = 0;
    const actualCenters = result.probabilities.map(value => {
      const center = (cumulative + value / 2) * w;
      cumulative += value;
      return center;
    });
    const positions = actualCenters.map((center, i) => Math.max(edge + labelWidths[i] / 2, Math.min(w - edge - labelWidths[i] / 2, center)));
    for (let i = 1; i < 3; i++) positions[i] = Math.max(positions[i], positions[i - 1] + (labelWidths[i - 1] + labelWidths[i]) / 2 + gap);
    positions[2] = Math.min(positions[2], w - edge - labelWidths[2] / 2);
    for (let i = 1; i >= 0; i--) positions[i] = Math.min(positions[i], positions[i + 1] - (labelWidths[i + 1] + labelWidths[i]) / 2 - gap);
    return {width:w,height:splitIntervals?134:120,actualCenters,positions,labelWidths,intervalTexts,intervalLines,splitIntervals,estimates,intervalFont,probabilityFont,titleFont,mobile};
  }
  function chartSvg(result, width) {
    const l = chartLayout(result, width);
    const barTop = 59, barHeight = 20;
    const valueY = 37, titleY = 13;
    const intervalY = l.splitIntervals ? 109 : 111;
    const fills = ['#ffffff', '#9c9c99', '#20201d'];
    let x = 0;
    const bars = result.probabilities.map((value, i) => {
      const segmentWidth = value * l.width;
      const bar = `<rect x="${x}" y="${barTop}" width="${segmentWidth}" height="${barHeight}" fill="${fills[i]}"/>`;
      x += segmentWidth;
      return bar;
    }).join('');
    const labels = l.positions.map((position, i) => {
      const center = l.actualCenters[i];
      const pointY = barTop - 4;
      const startY = 43;
      const lineBelowY = barTop + barHeight + 4;
      return `<g fill="#24241f" text-anchor="middle">
        <text x="${position}" y="${titleY}" font-family="Arial,Helvetica,sans-serif" font-size="${l.titleFont}" letter-spacing="1.1" fill="#646159">${SHORT_NAMES[i]}</text>
        <text x="${position}" y="${valueY}" font-family="Georgia,serif" font-size="${l.probabilityFont}">${xmlText(l.estimates[i])}</text>
        <path d="M ${position} ${startY} L ${position} ${startY + 5} L ${center} ${pointY - 4} L ${center} ${pointY}" fill="none" stroke="#a19a8c" stroke-width="0.8"/>
        <path d="M ${center} ${lineBelowY} L ${center} ${lineBelowY + 4} L ${position} ${intervalY - 21} L ${position} ${intervalY - 15}" fill="none" stroke="#a19a8c" stroke-width="0.8"/>
        <text x="${position}" y="${intervalY}" font-family="Arial,Helvetica,sans-serif" font-size="${l.intervalFont}" style="font-variant-numeric:tabular-nums">${l.intervalLines[i].map((line, j) => `<tspan x="${position}" dy="${j === 0 ? 0 : 17}">${line}</tspan>`).join('')}</text>
      </g>`;
    }).join('');
    const accessible = result.probabilities.map((p,i) => `${CLASS_NAMES[i]}: ${percentage(p)}; intervalo de confiança de 95%: ${percentage(result.intervals[i][0])} a ${percentage(result.intervals[i][1])}.`).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="chart-title chart-description" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}"><title id="chart-title">Probabilidades da partida: brancas ${result.white}, pretas ${result.black}</title><desc id="chart-description">${xmlText(accessible)}</desc>${bars}<rect x="0.5" y="${barTop + 0.5}" width="${l.width - 1}" height="${barHeight - 1}" fill="none" stroke="#8c877d" stroke-width="1"/>${labels}</svg>`;
  }
  const api = {featureVector,softmax,quantile,compute,chartLayout,chartSvg,percentage};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChessCalculator = api;
  if (typeof document === 'undefined') return;

  const model = root.ChessModel;
  const form = document.getElementById('consulta');
  const whiteInput = document.getElementById('white-rating');
  const blackInput = document.getElementById('black-rating');
  const results = document.getElementById('results');
  const message = document.getElementById('input-message');
  const chart = document.getElementById('probability-chart');
  const summary = document.getElementById('live-summary');
  let current = null, inputTimer;
  function draw() {
    if (current && !results.hidden) chart.innerHTML = chartSvg(current, chart.clientWidth || 700);
  }
  function update(announce = true) {
    const raw = [whiteInput.value.trim(), blackInput.value.trim()];
    const values = raw.map(value => value === '' ? NaN : Number(value));
    const valid = values.map(value => Number.isInteger(value) && value >= 1500 && value <= 3000);
    [whiteInput, blackInput].forEach((input,i) => input.setAttribute('aria-invalid', String(!valid[i])));
    if (!model) {
      results.hidden = true;message.hidden = false;
      message.textContent = 'Não foi possível carregar o modelo. Confira se model.js está na mesma pasta de index.html.';
      return;
    }
    if (!valid.every(Boolean)) {
      current = null;results.hidden = true;message.hidden = false;
      message.textContent = raw.some(value => value === '') ? 'Preencha os dois ratings para consultar.' : 'Use dois ratings inteiros entre 1500 e 3000.';
      summary.textContent = '';return;
    }
    current = compute(values[0], values[1], model);
    results.hidden = false;message.hidden = !current.extrapolation;
    message.textContent = current.extrapolation ? 'Este par inclui rating acima de 2816, o máximo observado na base. A consulta envolve extrapolação.' : '';
    document.getElementById('rating-summary').textContent = current.white + ' × ' + current.black;
    draw();
    if (announce) summary.textContent = current.probabilities.map((p,i) => `${CLASS_NAMES[i]}: ${percentage(p)}; intervalo de 95% de ${percentage(current.intervals[i][0])} a ${percentage(current.intervals[i][1])}.`).join(' ');
  }
  form.addEventListener('submit', event => {event.preventDefault();clearTimeout(inputTimer);update();});
  for (const input of [whiteInput, blackInput]) input.addEventListener('input', () => {clearTimeout(inputTimer);inputTimer=setTimeout(update,180);});
  document.getElementById('swap').addEventListener('click', () => {
    clearTimeout(inputTimer);const prior = whiteInput.value;whiteInput.value=blackInput.value;blackInput.value=prior;update();
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(draw).observe(chart);
  else root.addEventListener('resize',draw);
  update(false);
})(typeof globalThis !== 'undefined' ? globalThis : this);
