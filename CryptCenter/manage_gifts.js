// manage_gifts.js (ID指定版)
const fs = require('fs');
const crypto = require('crypto');

// 設定
const BASE_URL = "http://163.44.101.129/CryptCenter"; // ★本番用に書き換え
const DATA_FILE = 'gifts.json';

// ★ 今回発行するトークンの開始IDと枚数
const START_ID = 0;
const AMOUNT = 10;

let gifts = [];
if (fs.existsSync(DATA_FILE)) {
    gifts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // 既存データがある場合、IDが被らないようにチェック推奨
    // 今回は簡易的に上書きまたは追加のロジックとします
}

console.log(`--- ID #${START_ID} から ${AMOUNT}枚 分のコードを生成 ---`);

for (let i = 0; i < AMOUNT; i++) {
    const tokenId = START_ID + i;
    const code = crypto.randomBytes(8).toString('hex');
    
    gifts.push({
        tokenId: tokenId, // ★ここが追加ポイント
        code: code,
        used: false,
        txHash: null,
        usedBy: null
    });

    // IDと一緒にURLを表示
    console.log(`ID #${tokenId}: ${BASE_URL}/index.html?code=${code}`);
}

fs.writeFileSync(DATA_FILE, JSON.stringify(gifts, null, 2));
console.log("--- 保存完了 ---");
