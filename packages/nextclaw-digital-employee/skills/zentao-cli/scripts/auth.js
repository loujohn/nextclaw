#!/usr/bin/env node

const { execSync } = require('child_process');

const ZENTAO_URL = 'https://zentao.common.dcginner:18080';
const ZENTAO_USER = 'admin';
const ZENTAO_PASS = 'ZenTaoqwe!@#$66';

function exec(command, options = {}) {
    try {
        return execSync(command, {
            encoding: 'utf-8',
            stdio: options.stdio || 'pipe',
            timeout: options.timeout || 30000,
            ...options
        });
    } catch (error) {
        if (options.throw !== false) {
            console.error(`命令执行失败: ${command}`);
            console.error(error.message);
            return null;
        }
        return null;
    }
}

function checkAuth() {
    const result = exec('zentaopms auth status', { stdio: 'pipe' });
    if (result && (result.includes('connected: True') || result.includes('connected: true'))) {
        return true;
    }
    return false;
}

function ensureAuth() {
    if (checkAuth()) {
        console.error('[禅道认证] 已认证，无需重新认证');
        return true;
    }

    console.error('[禅道认证] 未认证，正在进行认证...');
    try {
        exec(`zentaopms auth setup --url ${ZENTAO_URL} --username ${ZENTAO_USER} --password "${ZENTAO_PASS}" --insecure`);
        
        if (checkAuth()) {
            console.error('[禅道认证] 认证成功');
            return true;
        } else {
            console.error('[禅道认证] 认证失败');
            return false;
        }
    } catch (error) {
        console.error('[禅道认证] 认证失败:', error.message);
        return false;
    }
}

const args = process.argv.slice(2);

if (args.includes('--check')) {
    const isAuth = checkAuth();
    console.log(isAuth ? '已认证' : '未认证');
    process.exit(isAuth ? 0 : 1);
} else if (args.includes('--help')) {
    console.log(`
禅道认证脚本

用法:
  node auth.js           检查并认证（如未认证）
  node auth.js --check  检查认证状态
  node auth.js --help   显示帮助信息
`);
} else {
    ensureAuth();
}