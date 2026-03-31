#!/usr/bin/env node

/**
 * 四横四纵两端架构图生成器 V4.4 (修正内联空格对齐及边框网格矩阵)
 */

const fs = require('fs');
const path = require('path');

const THEMES = {
  digital_chongqing: {
    bgPage: '#eaf2f8',
    bgLayer: '#ffffff',
    primary: '#17508e',
    secondary: '#3272b6',
    borderLight: '#8db7e8',
    text: '#222222',
    textLight: '#ffffff',
    verticalBg: '#3272b6',
    fontFamily: '"Microsoft YaHei", "SimHei", "PingFang SC", sans-serif'
  }
};

function generateSihengSizongHTML(data, theme) {
  const t = THEMES[theme] || THEMES.digital_chongqing;

  // ==================== 1. 两端层 ====================
  function renderDuan(layer) {
    const leftMod = layer.modules.find(m => m.position === 'left');
    const rightMod = layer.modules.find(m => m.position === 'right');
    return `
      <div class="arch-layer layer-duan">
        <div class="layer-label"><span>${layer.name.split('').join('<br>')}</span></div>
        <div class="layer-content duan-content">
          <div class="duan-module-left">${leftMod ? leftMod.name : ''}</div>
          <div class="duan-module-right">${rightMod ? rightMod.name : ''}</div>
        </div>
      </div>
    `;
  }

  // ==================== 2. 业务应用体系 ====================
  function renderApp(layer) {
    const cockpitTitle = layer.cockpit_title || '';
    const sceneLabelsHTML = (layer.scene_labels || []).map(lbl =>
      `<div class="scene-label" style="background:${lbl.color || t.primary}">${lbl.name}</div>`
    ).join('');

    const topRibbonHTML = cockpitTitle ? `
      <div class="app-cockpit">${cockpitTitle}</div>
      <div class="app-scenes">${sceneLabelsHTML}</div>
    ` : '';

    const groupsHTML = (layer.groups || []).map(group => {
      // 解决问题2：竖排不再使用<br>，直接依赖原生CSS窄柱折行，并在外面给蓝色背景撑满全高，同时取消极宽的间隙
      const vertColsHTML = (group.vertical_columns || []).map(v =>
        `<div class="app-vert-col"><div class="app-vert-text">${v.split('').join('<br>')}</div></div>`
      ).join('');

      // 解决问题3：去除多余换行缩进（在之前模板字符串带有 \n        导致文字偏移），写在一行内
      const rowsHTML = (group.horizontal_rows || []).map(row => {
        const rowItems = row.map(item =>
          `<div class="app-horz-item" style="flex: ${item.span || 1}; background: ${item.color || t.primary}">${item.name}</div>`
        ).join('');
        return `<div class="app-horz-row">${rowItems}</div>`;
      }).join('');

      return `
        <div class="app-group">
          <div class="app-group-title">${group.name}</div>
          <div class="app-group-inner">
            <div class="app-vert-section">${vertColsHTML}</div>
            <div class="app-horz-section">${rowsHTML}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="arch-layer layer-app">
        <div class="layer-label"><span>${layer.name.replace(/\n/g, '<br>')}</span></div>
        <div class="layer-content app-content">
          ${topRibbonHTML}
          <div class="app-groups-container">
            ${groupsHTML}
          </div>
        </div>
      </div>
      <div class="global-down-arrows">
         <div class="d-arrow da-1"></div>
         <div class="d-arrow da-2"></div>
         <div class="d-arrow da-3"></div>
      </div>
    `;
  }

  // ==================== 3. 连接带 ====================
  function renderConnectionBand(conn) {
    if (!conn) return '';
    return `
      <div class="conn-band-wrap">
        <div class="conn-left-box">${conn.left}</div>
        <div class="conn-arrow-h">
          <div class="clip-arrow-right"><span>${conn.left_label}</span></div>
        </div>
        <div class="conn-center-text">${conn.center}</div>
        <div class="conn-arrow-h">
          <div class="clip-arrow-left"><span>${conn.right_label}</span></div>
        </div>
        <div class="conn-right-box">${conn.right}</div>
      </div>
    `;
  }

  // ==================== 4. 业务支撑层 ====================
  function renderSupport(layer) {
    const modulesHTML = (layer.module_groups || []).map(g => {
      const itemsHTML = g.items.map(it => `<div class="support-item">${it}</div>`).join('');
      return `
        <div class="support-box">
          <div class="support-box-title">${g.name}</div>
          <div class="support-box-items">${itemsHTML}</div>
        </div>
      `;
    }).join('');

    const fullBarsHTML = (layer.full_width_bars || []).map(bar => {
      return `<div class="support-fullbar bar-${bar.type}">${bar.title}</div>`;
    }).join('');

    return `
      <div class="arch-layer layer-support">
        <div class="layer-label"><span>${layer.name.replace(/\n/g, '<br>')}</span></div>
        <div class="layer-content support-content">
          <div class="support-grid">${modulesHTML}</div>
          <div class="support-bars">${fullBarsHTML}</div>
        </div>
      </div>
    `;
  }

  // ==================== 5. 数据资源层 ====================
  function renderData(layer) {
    const drs = layer.drs || {};
    const trusted = layer.trusted_space || {};
    const warehouse = layer.data_warehouse || {};

    const drsHTML = (drs.items || []).map(it => `
      <div class="drs-item">
        <div class="cylinder"></div>
        <div class="cylinder-text">${it}</div>
      </div>
    `).join('');

    const trustedHTML = (trusted.items || []).map(it => `<div class="trusted-item">${it}</div>`).join('');
    const hqHTML = (warehouse.hq_items || []).map(it => `<div class="hq-item">${it}</div>`).join('');
    const bizHTML = (layer.business_dbs || []).map(it => `<div class="db-bag">${it}</div>`).join('');
    const topicHTML = (layer.topic_dbs || []).map(it => `<div class="db-bag">${it}</div>`).join('');

    return `
      <div class="arch-layer layer-data">
        <div class="layer-label"><span>${layer.name.replace(/\n/g, '<br>')}</span></div>
        <div class="layer-content data-content">
          <div class="data-cols-wrapper">
            
            <!-- 1. 左列: DRS -->
            <div class="data-col drs-col">
              <div class="data-title">${drs.name}</div>
              <div class="data-col-border">
                <div class="drs-top-section">
                  <div class="data-drs-grid">${drsHTML}</div>
                </div>
              </div>
            </div>

            <!-- 2. 中列: 可信数据空间 -->
            <div class="data-col trusted-col">
              <div class="data-title">${trusted.name}</div>
              <div class="data-col-border">
                <div class="trusted-top-section">
                  <div class="trusted-grid">${trustedHTML}</div>
                </div>
              </div>
            </div>

            <!-- 3. 右列: 住建数仓 + 业务库 + 专题库 -->
            <div class="data-col warehouse-col">
              <div class="data-title">${warehouse.name}</div>
              <div class="data-col-border">
                <div class="warehouse-top-section">
                  <div class="hq-title">${warehouse.hq_title}</div>
                  <div class="hq-grid">${hqHTML}</div>
                </div>
                <div class="data-col-divider"></div>
                <div class="db-type-group">
                  <div class="db-type-label">业务<br>库</div>
                  <div class="db-type-items">${bizHTML}</div>
                </div>
                <div class="data-col-divider"></div>
                <div class="db-type-group">
                  <div class="db-type-label">专题<br>库</div>
                  <div class="db-type-items">${topicHTML}</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  // ==================== 6. 基础设施层 ====================
  function renderInfra(layer) {
    const itemsHTML = (layer.items || []).map(it => `<div class="infra-item">${it}</div>`).join('');
    return `
      <div class="arch-layer layer-infra">
        <div class="layer-label"><span>${layer.name.replace(/\n/g, '<br>')}</span></div>
        <div class="layer-content infra-content">
          <div class="infra-cloud-title">${layer.main_title}</div>
          <div class="infra-items-row">${itemsHTML}</div>
        </div>
      </div>
    `;
  }

  // ==================== 7. 右侧四纵 ====================
  function renderVerts(systems) {
    return (systems || []).map(sys => {
      return `
        <div class="vert-sys-bar">
          <div class="vert-sys-title">${sys.name}</div>
          <div class="vert-sys-box"></div>
        </div>
      `;
    }).join('');
  }

  // ==================== 8. 图例 ====================
  function renderLegend(legend) {
    if (!legend) return '';
    const lgHTML = legend.map(l => `
      <div class="leg-item">
         <span class="leg-color leg-bg-${l.type}"></span>
         <span class="leg-txt">${l.label}</span>
      </div>
    `).join('');
    return `<div class="legend-box">${lgHTML}</div>`;
  }

  let layersJoined = '';
  const layersList = data.layers || [];

  for (let layer of layersList) {
    switch (layer.type) {
      case 'duan': layersJoined += renderDuan(layer); break;
      case 'app': layersJoined += renderApp(layer); break;
      case 'support':
        if (data.connection_band) layersJoined += renderConnectionBand(data.connection_band);
        layersJoined += renderSupport(layer);
        break;
      case 'data': layersJoined += renderData(layer); break;
      case 'infra': layersJoined += renderInfra(layer); break;
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${data.title} - 16:9比例PPT版</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${t.fontFamily}; background-color: #333;
      display: flex; justify-content: center; align-items: center;  
      min-height: 100vh; padding: 20px;
    }
    .main-wrapper {
      width: 1920px; height: 1080px; position: relative; background-color: ${t.bgPage};
      display: flex; flex-direction: column; padding: 24px 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); overflow: hidden; 
    }
    .arch-table { flex: 1; display: flex; min-height: 0; }
    .arch-main-column { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
    .arch-right-column { width: 140px; margin-left: 12px; display: flex; gap: 6px; justify-content: center; align-items: stretch; }

    /* ========== 通用层分离式结构 ========== */
    .arch-layer { display: flex; gap: 8px; min-height: 0; }
    
    .layer-duan { flex: 0 0 auto; } 
    .layer-app { flex: 3.8; min-height: 0; } 
    .layer-support { flex: 2.8; min-height: 0; }
    .layer-data { flex: 2.6; min-height: 0; }
    .layer-infra { flex: 0 0 auto; }

    .layer-label {
      width: 58px; background-color: ${t.primary}; color: ${t.textLight};
      font-size: 16px; font-weight: bold; letter-spacing: 2px;
      display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.4;
      padding: 0; 
    }
    .layer-content {
      flex: 1; background: ${t.bgLayer}; border: 3px solid ${t.primary}; padding: 6px;
      display: flex; flex-direction: column; gap: 4px; position: relative; min-height: 0;
    }

    /* ========== 1.两端 ========== */
    .duan-content { flex-direction: row; gap: 6px; padding: 6px; }
    .duan-module-left, .duan-module-right {
      background-color: ${t.secondary}; color: ${t.textLight}; font-weight: bold;
      font-size: 18px; text-align: center; padding: 12px 0; display: flex; align-items: center; justify-content: center;
    }
    .duan-module-left { flex: 1; } .duan-module-right { flex: 1.8; }

    /* ========== 2.业务应用 ========== */
    .app-content { flex-direction: column; gap: 4px; }
    .app-cockpit {
      background: linear-gradient(90deg, #17508e 0%, #3a7dc9 50%, #17508e 100%);
      color: ${t.textLight}; font-size: 20px; font-weight: bold; text-align: center;
      padding: 6px 0; letter-spacing: 2px; flex: 0 0 auto;
    }
    .app-scenes { display: flex; gap: 4px; flex: 0 0 auto; }
    .scene-label {
      flex: 1; color: ${t.textLight}; font-size: 13px; font-weight: bold;
      padding: 6px 2px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    
    /* 解决问题1：恢复五个核心板块独立边框 */
    .app-groups-container { display: flex; flex-direction: row; gap: 6px; flex: 1; min-height: 0; }
    .app-group {
      flex: 1; border: 2px solid ${t.primary}; display: flex; flex-direction: column;
      background-color: #fbfcff; min-height: 0; 
    }
    .app-group-title {
      background-color: ${t.primary}; color: ${t.textLight}; font-weight: bold;
      font-size: 14px; text-align: center; padding: 4px 0; flex: 0 0 auto;
    }
    .app-group-inner { flex: 1; display: flex; flex-direction: column; padding: 4px; gap: 4px; min-height: 0; }
    
    .app-vert-section { flex: 1.25; display: flex; gap: 3px; min-height: 0; }
    .app-vert-col { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    /* 解决问题2：统一长度，取消过高间隙，竖排列充满其父盒子！ */
    .app-vert-text {
      flex: 1; /* 占据所在上半部的所有高度，因此长度完全一致 */
      background-color: ${t.verticalBg}; color: ${t.textLight}; font-size: 11px;
      line-height: 1.25; text-align: center; padding: 6px 2px; letter-spacing: 1px;
    }
    /* 但我为了解决斜杠折行使用了 <br>，所以在JS里我又放回去了，保证中文纯正竖列 */

    .app-horz-section { flex: 1; display: flex; flex-direction: column; gap: 3px; min-height: 0;}
    .app-horz-row { flex: 1; display: flex; gap: 2px; justify-content: stretch; min-height: 0;}
    
    /* 解决问题3：去除可能造成空白偏移的 pre-wrap */
    .app-horz-item {
      color: ${t.textLight}; font-size: 11px; text-align: center; padding: 4px;
      line-height: 1.25; white-space: normal; display: flex; align-items: center; justify-content: center;
      flex-direction: column;
    }

    .global-down-arrows {
      display: flex; align-items: center; justify-content: center; position: relative;
      height: 10px; margin-left: 66px; flex: 0 0 auto;
    }
    .d-arrow {
      width: 0; height: 0; border-left: 16px solid transparent; border-right: 16px solid transparent; border-top: 20px solid ${t.primary};
      position: absolute; top: -10px;
    }
    .da-1 { left: 16%; } .da-2 { left: 50%; transform: translateX(-50%); } .da-3 { left: 81%; }

    /* ========== 3. 连接带 ========== */
    .conn-band-wrap {
      display: flex; align-items: center; justify-content: space-between;
      margin-left: 66px; height: 38px; flex: 0 0 auto; margin-top:2px;
    }
    .conn-left-box, .conn-right-box {
      background-color: #79a1c4; color: #fff; font-weight: bold; font-size: 14px; padding: 6px 14px; 
    }
    .conn-center-text { color: #000; font-size: 16px; font-weight: bold; margin: 0 10px; }
    .conn-arrow-h { flex: 1; display: flex; padding: 0 10px; justify-content: center; }
    .clip-arrow-right {
      width: 100%; max-width: 250px; height: 30px; background: ${t.primary};
      clip-path: polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%, 10% 50%);
      display: flex; align-items: center; justify-content: center;
    }
    .clip-arrow-right span {
      display: block; width: 96%; height: 24px; background: #eaf2f8; 
      clip-path: polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%, 10% 50%);
      color: ${t.primary}; font-weight: bold; font-size: 14px; text-align: center; line-height: 24px;
    }
    .clip-arrow-left {
      width: 100%; max-width: 250px; height: 30px; background: ${t.primary};
      clip-path: polygon(10% 0%, 100% 0%, 90% 50%, 100% 100%, 10% 100%, 0% 50%);
      display: flex; align-items: center; justify-content: center;
    }
    .clip-arrow-left span {
      display: block; width: 96%; height: 24px; background: #eaf2f8; 
      clip-path: polygon(10% 0%, 100% 0%, 90% 50%, 100% 100%, 10% 100%, 0% 50%);
      color: ${t.primary}; font-weight: bold; font-size: 14px; text-align: center; line-height: 24px;
    }

    /* ========== 4. 业务支撑层 ========== */
    .support-grid { display: flex; gap: 8px; flex: 1; min-height: 0; }
    .support-box {
      flex: 1; border: 2px dashed ${t.primary}; display: flex; flex-direction: column; padding: 4px; min-height: 0; 
    }
    .support-box-title {
      font-size: 14px; font-weight: bold; color: ${t.primary}; text-align: center; padding: 2px; flex: 0 0 auto;
    }
    .support-box-items {
      padding: 0 4px 2px 4px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; align-content: flex-start;
    }
    .support-item {
      background-color: #d1e1f3; color: ${t.primary}; font-size: 11.5px; font-weight: bold;
      text-align: center; padding: 2px 1px; display: flex; align-items: center; justify-content: center;
      line-height: 1.15; word-break: break-all; min-height: 32px;
    }
    .support-bars { display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; }
    .support-fullbar { text-align: center; font-weight: bold; padding: 2px; font-size: 14px; }
    .bar-transparent { color: #000; border-top: 1px dotted #ccc; font-size: 16px; padding: 6px;}
    .bar-solid { background-color: ${t.primary}; color: ${t.textLight}; }
    .bar-solid_light { background-color: #3f7ec1; color: ${t.textLight}; }

    /* ========== 5. 数据资源 ========== */
    .data-content { padding: 8px; display: flex; flex-direction: column; }
    .data-cols-wrapper { display: flex; flex-direction: row; gap: 8px; flex: 1; min-height: 0; }
    .data-col { display: flex; flex-direction: column; min-height: 0; }
    .drs-col { flex: 1.1; } .trusted-col { flex: 1; } .warehouse-col { flex: 1.9; }
    
    .data-title { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 4px; color: ${t.text}; flex: 0 0 auto; }
    
    .data-col-border {
      flex: 1; border: 2px dashed ${t.borderLight}; background: #fdfdfd; 
      display: flex; flex-direction: column; min-height: 0;
    }
    
    .drs-top-section { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 0; padding: 6px; }
    .data-drs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 100%; justify-items: center; }
    .drs-item { display: flex; flex-direction: column; align-items: center; }
    .cylinder {
      width: 48px; height: 26px; background: linear-gradient(180deg, #6496d0 0%, #306aad 100%);
      position: relative; margin-top: 6px;
    }
    .cylinder::before { content:''; position: absolute; top: -6px; left:0; width:48px; height: 12px; background: #8db5e2; border-radius: 50%; border: 1px solid #235894; }
    .cylinder::after { content:''; position: absolute; bottom: -6px; left:0; width:48px; height: 12px; background: #306aad; border-radius: 50%; border: 1px solid #235894; border-top: none; }
    .cylinder-text { font-size: 11px; margin-top: 12px; font-weight: bold; text-align: center; }

    .trusted-top-section { flex: 1; display: flex; flex-direction: column; padding: 8px 16px; min-height: 0; justify-content: center; }
    .trusted-grid { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .trusted-item { background: #e9f0f8; border: 1px solid #bccce0; font-size: 12px; padding: 6px; text-align: center; font-weight: bold; }

    .warehouse-top-section { flex: 1; display: flex; flex-direction: column; padding: 8px; min-height: 0; justify-content: center; align-items: center; }
    .hq-title { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 6px; }
    .hq-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; width: 100%; }
    .hq-item { background: #5b99db; color: white; font-size: 12px; padding: 6px; border-radius: 4px; text-align: center; white-space: nowrap; }

    .data-col-divider { border-top: 2px dashed ${t.borderLight}; width: 100%; flex: 0 0 auto; }
    
    .db-type-group { display: flex; flex-direction: row; align-items: stretch; min-height: 38px; padding: 4px; }
    .db-type-label { 
      font-size: 13px; font-weight: bold; padding: 0 10px; width: 48px; text-align: center; 
      border-right: 2px solid ${t.primary}; display: flex; align-items: center; justify-content: center;
      line-height: 1.1; 
    }
    .db-type-items { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; padding-left: 8px; align-items: center; }
    .db-bag { background: #5b99db; color: white; border-radius: 12px; padding: 4px 10px; font-size: 11px; font-weight: bold; }

    /* ========== 6. 基础设施 ========== */
    .infra-content { padding: 4px !important; }
    .infra-cloud-title { text-align: center; font-weight: bold; font-size: 16px; background: #d0e4f5; padding: 4px 0; border: 3px solid ${t.primary}; border-bottom: none; }
    .infra-items-row { display: flex; background: ${t.primary}; border: 3px solid ${t.primary}; }
    .infra-item { flex: 1; color: #fff; font-size: 14px; font-weight: bold; text-align: center; padding: 4px 0; border-right: 1px solid rgba(255,255,255,0.4); }
    .infra-item:last-child { border-right: none; }

    /* ========== 7. 四纵竖条 ========== */
    .vert-sys-bar { 
      flex: 1; display: flex; flex-direction: column; align-items: center;
      border: 2px dashed #888; padding-bottom: 6px;
    }
    .vert-sys-title {
      font-size: 16px; font-weight: 900; color: #000;
      writing-mode: vertical-lr; text-orientation: mixed;
      letter-spacing: 4px; line-height: 1;
      text-align: center; padding-top: 12px; flex: 0 0 auto;
    }
    .vert-sys-box {
      flex: 1; min-height: 0;
    }

    /* ========== 8. 图例 ========== */
    .legend-box {
      position: absolute; bottom: 8px; right: 8px; background: transparent; border: 2px dashed #888; padding: 6px 10px; display: flex; flex-direction: column; gap: 4px; z-index: 50;
    }
    .leg-item { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: bold;}
    .leg-color { width: 14px; height: 10px; border: 1px solid #666; }
    .leg-bg-new { background: ${t.primary}; }
    .leg-bg-existing { background: #3272b6; }
    .leg-bg-reuse { background: #00af50; }

  </style>
</head>
<body>
  <div class="main-wrapper">
    <div class="arch-table">
      <div class="arch-main-column">${layersJoined}</div>
      <div class="arch-right-column">${renderVerts(data.vertical_systems)}</div>
    </div>
    ${renderLegend(data.legend)}
  </div>
</body>
</html>`;
}

function main() {
  const args = process.argv.slice(2);
  let inputFile = null; let outputDir = './output';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) { inputFile = args[i + 1]; i++; }
    else if (args[i] === '--output' && args[i + 1]) { outputDir = args[i + 1]; i++; }
  }
  if (!inputFile) process.exit(1);
  const data = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf-8'));
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'siheng_sizong_architecture.html'), generateSihengSizongHTML(data, data.theme || 'digital_chongqing'), 'utf-8');
}

if (require.main === module) main();
module.exports = { generateSihengSizongHTML, THEMES };
