import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';
import { DataPoint } from 'src/dataPoints';

@Injectable()
export class ChartService {
  async generateChartImage(dataPoints: DataPoint[]): Promise<string> {
    // Cria labels espaçados dinamicamente
    const allLabels = dataPoints.map((dp) => {
      const date = new Date(dp.timestamp);
      return `${date.getDate()}/${date.getMonth() + 1} - ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    });

    // Calcula o intervalo para mostrar labels espaçados
    const totalPoints = dataPoints.length;
    let labelInterval = 1;
    if (totalPoints > 50) labelInterval = Math.floor(totalPoints / 10);
    else if (totalPoints > 20) labelInterval = Math.floor(totalPoints / 8);
    else if (totalPoints > 10) labelInterval = Math.floor(totalPoints / 6);

    // Cria array de labels com alguns vazios para espaçamento
    const labels = allLabels.map((label, index) => {
      return index % labelInterval === 0 ? label : '';
    });

    const temperatureData = dataPoints.map((dp) => dp.temperature || 0);
    const moistureData = dataPoints.map((dp) => dp.moisture || 0);

    // Limites que você quer mostrar no gráfico
    const TEMP_MAX = 29;
    const TEMP_MIN = 26;
    const MOIST_MAX = 99;
    const MOIST_MIN = 1;

    const html = `
  <html>
    <head>
      <meta charset="utf-8" />
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <canvas id="chart" width="1250" height="650"></canvas>
      <script>
        const ctx = document.getElementById('chart').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: ${JSON.stringify(labels)},
            datasets: [
              { 
                label: 'Temperatura', 
                data: ${JSON.stringify(temperatureData)}, 
                borderColor: '#5388CB', 
                backgroundColor: '#5388CB',
                borderWidth: 2,
                yAxisID: 'yTemp',
                pointRadius: 1,
                pointHoverRadius: 3
              },
              { 
                label: 'Umidade', 
                data: ${JSON.stringify(moistureData)}, 
                borderColor: '#C294CB', 
                backgroundColor: '#C294CB',
                borderWidth: 2,
                yAxisID: 'yMoist',
                pointRadius: 1,
                pointHoverRadius: 3
              },
              // Limites Temperatura
              { 
                label: 'Limite Temperatura', 
                data: Array(${temperatureData.length}).fill(${TEMP_MAX}),
                borderColor: '#FFA500',
                backgroundColor: '#FFA500',
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                yAxisID: 'yTemp'
              },
              { 
                label: 'Limite Temperatura Min', 
                data: Array(${temperatureData.length}).fill(${TEMP_MIN}),
                borderColor: '#FFA500',
                backgroundColor: '#FFA500',
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                yAxisID: 'yTemp'
              },
              // Limites Umidade
              { 
                label: 'Limite Umidade Máx', 
                data: Array(${moistureData.length}).fill(${MOIST_MAX}),
                borderColor: '#32CD32',
                backgroundColor: '#32CD32',
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                yAxisID: 'yMoist'
              },
              { 
                label: 'Limite Umidade Min', 
                data: Array(${moistureData.length}).fill(${MOIST_MIN}),
                borderColor: '#32CD32',
                backgroundColor: '#32CD32',
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                yAxisID: 'yMoist'
              }
            ]
          },
          options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: { 
              legend: { 
                position: 'bottom',
                labels: { 
                  usePointStyle: true,
                  padding: 15
                }
              },
              title: {
                display: false
              }
            },
            scales: {
              x: {
                display: true,
                title: {
                  display: true,
                  text: 'DATA - HORA',
                  color: '#666'
                },
                grid: {
                  color: '#e0e0e0',
                  lineWidth: 1
                },
                ticks: {
                  maxRotation: 45,
                  minRotation: 0,
                  autoSkip: false,
                  maxTicksLimit: 10,
                  font: {
                    size: 10
                  }
                }
              },
              yTemp: { 
                type: 'linear', 
                position: 'left', 
                min: ${TEMP_MIN - 1}, 
                max: ${TEMP_MAX + 3}, 
                title: { 
                  display: true, 
                  text: 'Temperatura (°C)',
                  color: '#5388CB'
                },
                ticks: {
                  color: '#5388CB',
                  stepSize: 0.5,
                  font: {
                    size: 10
                  }
                },
                grid: {
                  color: '#e0e0e0'
                }
              },
              yMoist: { 
                type: 'linear', 
                position: 'right', 
                min: 0, 
                max: 100, 
                title: { 
                  display: true, 
                  text: 'Umidade (%)',
                  color: '#C294CB'
                },
                ticks: {
                  color: '#C294CB',
                  stepSize: 10,
                  font: {
                    size: 10
                  }
                },
                grid: { 
                  drawOnChartArea: false,
                  color: '#e0e0e0'
                }
              }
            },
            interaction: { 
              mode: 'index', 
              intersect: false 
            },
            elements: { 
              line: { 
                tension: 0.1 
              },
              point: {
                backgroundColor: '#fff',
                borderWidth: 2
              }
            }
          }
        });
      </script>
    </body>
  </html>
`;

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Aguarda um pouco para garantir que o chart seja renderizado
    await page.waitForTimeout(1000);

    const chartBase64 = await page.screenshot({
      type: 'png',
      fullPage: false,
    });
    await browser.close();

    return `data:image/png;base64,${chartBase64.toString('base64')}`;
  }
}
