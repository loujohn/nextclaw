#!/usr/bin/env node

/**
 * 架构图生成器
 * 使用 HTML/CSS + SVG 生成分层架构图
 */

const fs = require('fs');
const path = require('path');

// 主题配置
const THEMES = {
  digital_chongqing: {
    primary: '#1e5aa8',
    secondary: '#2d7dd2',
    accent: '#4a9eff',
    background: 'linear-gradient(180deg, #e8f4fc 0%, #ffffff 100%)',
    text: '#333333',
    textLight: '#ffffff',
    border: '#1e5aa8',
    layerColors: ['#1e5aa8', '#2d7dd2', '#4a9eff', '#6bb3ff'],
    fontFamily: '"Microsoft YaHei", "SimHei", sans-serif'
  }
};

// 生成 HTML 模板
function generateHTML(data, theme) {
  const t = THEMES[theme] || THEMES.digital_chongqing;
  
  const layersHTML = data.layers.map((layer, index) => {
    const layerColor = layer.color || t.layerColors[index % t.layerColors.length];
    const modulesHTML = layer.modules.map(module => {
      const subModulesHTML = module.sub_modules ? 
        module.sub_modules.map(sm => `<div class="sub-module">${sm}</div>`).join('') : '';
      
      return `
        <div class="module">
          <div class="module-header" style="background: ${layerColor}">
            ${module.name}
          </div>
          ${subModulesHTML ? `<div class="module-body">${subModulesHTML}</div>` : ''}
        </div>
      `;
    }).join('');
    
    return `
      <div class="layer">
        <div class="layer-label" style="background: ${layerColor}">
          ${layer.name}
        </div>
        <div class="layer-content">
          ${modulesHTML}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: ${t.fontFamily};
      background: ${t.background};
      padding: 40px;
      min-width: 1400px;
    }
    
    .architecture-container {
      max-width: 1600px;
      margin: 0 auto;
    }
    
    .architecture-title {
      text-align: center;
      font-size: 32px;
      font-weight: bold;
      color: ${t.primary};
      margin-bottom: 40px;
      padding: 20px;
      border-bottom: 3px solid ${t.primary};
    }
    
    .layer {
      display: flex;
      margin-bottom: 30px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .layer-label {
      width: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      color: ${t.textLight};
      font-size: 20px;
      font-weight: bold;
      padding: 20px 10px;
    }
    
    .layer-content {
      flex: 1;
      padding: 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      align-items: flex-start;
    }
    
    .module {
      background: #ffffff;
      border: 2px solid ${t.border};
      border-radius: 6px;
      overflow: hidden;
      min-width: 200px;
      max-width: 300px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .module-header {
      color: ${t.textLight};
      padding: 12px 16px;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
    }
    
    .module-body {
      padding: 12px;
      background: #f8fbff;
    }
    
    .sub-module {
      padding: 8px 12px;
      margin-bottom: 8px;
      background: #ffffff;
      border: 1px solid #d0e3f7;
      border-radius: 4px;
      font-size: 13px;
      color: ${t.text};
      text-align: center;
    }
    
    .sub-module:last-child {
      margin-bottom: 0;
    }
    
    .connections {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: -1;
    }
    
    @media print {
      body {
        background: white;
        padding: 20px;
      }
      
      .layer {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="architecture-container">
    <h1 class="architecture-title">${data.title}</h1>
    ${layersHTML}
  </div>
</body>
</html>`;
}

// 生成 SVG 版本
function generateSVG(data, theme) {
  const t = THEMES[theme] || THEMES.digital_chongqing;
  const width = 1600;
  const layerHeight = 200;
  const headerHeight = 80;
  const totalHeight = headerHeight + (data.layers.length * (layerHeight + 30));
  
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">`;
  
  // 背景
  svgContent += `
    <defs>
      <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#e8f4fc;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#ffffff;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgGradient)"/>
  `;
  
  // 标题
  svgContent += `
    <text x="${width/2}" y="50" text-anchor="middle" font-family="${t.fontFamily}" font-size="32" font-weight="bold" fill="${t.primary}">
      ${data.title}
    </text>
    <line x1="100" y1="70" x2="${width-100}" y2="70" stroke="${t.primary}" stroke-width="3"/>
  `;
  
  // 层
  let currentY = headerHeight;
  data.layers.forEach((layer, index) => {
    const layerColor = layer.color || t.layerColors[index % t.layerColors.length];
    
    // 层背景
    svgContent += `
      <rect x="40" y="${currentY}" width="${width-80}" height="${layerHeight}" fill="white" stroke="#ddd" stroke-width="1" rx="8"/>
    `;
    
    // 层标签
    svgContent += `
      <rect x="40" y="${currentY}" width="60" height="${layerHeight}" fill="${layerColor}" rx="8"/>
      <text x="70" y="${currentY + layerHeight/2}" text-anchor="middle" font-family="${t.fontFamily}" font-size="20" font-weight="bold" fill="white" transform="rotate(-90, 70, ${currentY + layerHeight/2})">
        ${layer.name}
      </text>
    `;
    
    currentY += layerHeight + 30;
  });
  
  svgContent += '</svg>';
  return svgContent;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let outputDir = './output';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputFile = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    }
  }
  
  if (!inputFile) {
    console.error('Usage: node generate_architecture.js --input <json_file> [--output <output_dir>]');
    process.exit(1);
  }
  
  // 读取输入文件
  const inputPath = path.resolve(inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const theme = data.theme || 'digital_chongqing';
  
  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 生成 HTML
  const html = generateHTML(data, theme);
  const htmlPath = path.join(outputDir, 'architecture.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`✓ Generated: ${htmlPath}`);
  
  // 生成 SVG
  const svg = generateSVG(data, theme);
  const svgPath = path.join(outputDir, 'architecture.svg');
  fs.writeFileSync(svgPath, svg, 'utf-8');
  console.log(`✓ Generated: ${svgPath}`);
  
  console.log('\nDone! Open the HTML file in a browser to view and export the architecture diagram.');
}

if (require.main === module) {
  main();
}

module.exports = { generateHTML, generateSVG, THEMES };
