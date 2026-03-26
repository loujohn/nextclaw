#!/usr/bin/env node

const http = require('http');
const https = require('https');

const BASE_URL = process.env.WORK_TIME_BASE_URL || 'http://shangji.dcg-internal-services.test.dcginner:10006/api';
const API_URL = process.env.WORK_TIME_API || `${BASE_URL}/admin/zenTaoTaskLog/unfilledDetail`;
const TIMEOUT = parseInt(process.env.TIMEOUT || '600000', 10);

function postForm(url, formData, timeout) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const body = Object.entries(formData)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    
    const timer = setTimeout(() => {
      reject(new Error(`请求超时 (${timeout}ms)`));
    }, timeout);
    
    const req = protocol.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic dGVzdDp0ZXN0',
        'Accept': 'application/json',
        'User-Agent': 'nextclaw-work-time-check/1.0'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        clearTimeout(timer);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    
    req.write(body);
    req.end();
  });
}

function fetch(url, token, timeout) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const timer = setTimeout(() => {
      reject(new Error(`请求超时 (${timeout}ms)`));
    }, timeout);
    
    const req = protocol.get(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'nextclaw-work-time-check/1.0'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        clearTimeout(timer);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function getToken(baseUrl, timeout) {
  const tokenUrl = `${baseUrl}/admin/oauth2/token`;
  const formData = {
    grant_type: 'password',
    username: 'admin',
    password: 'Dcg@123456',
    login_type: 'quick'
  };
  
  const result = await postForm(tokenUrl, formData, timeout);
  
  if (result.access_token) {
    return result.access_token;
  }
  throw new Error(`获取Token失败: ${JSON.stringify(result)}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  let apiUrl = API_URL;
  let useMockData = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      apiUrl = args[i + 1];
      i++;
    } else if (args[i] === '--mock') {
      useMockData = true;
    } else if (args[i] === '--help') {
      console.log(`
工时检查脚本 - 获取工时数据

用法:
  node work-time-check.js [选项]

选项:
  --url <url>    指定接口地址 (默认: ${API_URL})
  --mock         使用模拟数据
  --help         显示帮助信息

环境变量:
  WORK_TIME_API 接口地址
  TIMEOUT       超时时间(ms)
`);
      process.exit(0);
    }
  }
  
  console.error(`[工时检查] 正在请求: ${apiUrl}`);
  
  try {
    let data;
    if (useMockData) {
      data = {
        code: 0,
        data: {
          queryDate: new Date().toISOString().split('T')[0],
          filledUsersCount: 3,
          unfilledUsersCount: 1,
          unfilledUsers: [
            {
              dingtalkId: "01300248685521525862",
              cnName: "吴振宁",
              unfilledTasks: [
                {
                  projectName: "城市治理智能感知巡检系统项目-项目",
                  projectLeader: "刘俊宏",
                  projectLeaderDingtalkId: "01300248685521525862",
                  tasks: [
                    "数字员工 / 完成员⼯创建与基 础配置能⼒"
                  ]
                }
              ]
            }
          ]
        }
      };
    } else {
      console.error(`[工时检查] 正在获取Token...`);
      const token = await getToken(BASE_URL, TIMEOUT);
      console.error(`[工时检查] Token获取成功，正在请求工时数据...`);
      data = await fetch(apiUrl, token, TIMEOUT);
    }
    
    console.error(`[工时检查] 获取数据成功`);
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error(`[工时检查] 失败:`, error.message);
    process.exit(1);
  }
}

main();
