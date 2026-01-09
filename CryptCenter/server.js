require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const fs = require('fs');

const app = express();

// JSON形式のリクエストを許可
app.use(express.json());
// 異なるドメインからのアクセスを許可
app.use(cors());

// ★重要★ 'public' フォルダの中身をWeb公開する設定
// これにより public/index.html や public/background.png にアクセス可能になります
app.use(express.static('public'));

// データの保存場所
const DATA_FILE = 'gifts.json';

// 環境変数の読み込み (.envファイルから)
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL; // Polygon MainnetのURL
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// ブロックチェーン接続設定
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// コントラクト設定
// 転送機能(safeTransferFrom)を使うためのABI定義
const abi = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) public"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

// --- API: トークン受け取り処理 ---
app.post('/api/claim', async (req, res) => {
    const { address, code } = req.body;

    // 1. 入力チェック
    if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ error: "無効なアドレスです" });
    }
    if (!code) {
        return res.status(400).json({ error: "ギフトコードがありません" });
    }

    // 2. ギフトコード台帳(gifts.json)の読み込み
    let gifts = [];
    try {
        if (fs.existsSync(DATA_FILE)) {
            gifts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        return res.status(500).json({ error: "サーバーエラー: データ読み込み失敗" });
    }

    // 3. コードの照合
    const giftIndex = gifts.findIndex(g => g.code === code);

    if (giftIndex === -1) {
        return res.status(404).json({ error: "無効なギフトコードです" });
    }
    
    const targetGift = gifts[giftIndex];

    // 使用済みチェック
    if (targetGift.used) {
        return res.status(400).json({ error: "このギフトコードは既に使用済みです" });
    }

    // 紐付いているトークンIDを取得
    const tokenId = targetGift.tokenId;
    console.log(`[Transfer Start] Token ID #${tokenId} -> To: ${address}`);

    try {
        // 4. ブロックチェーンへ転送トランザクション送信
        // 引数: (送り主[あなた], 宛先[ユーザー], ID)
        const serverAddress = await wallet.getAddress();
        
        // ★ガス代はここでサーバー(wallet)が支払います
        const tx = await contract.safeTransferFrom(serverAddress, address, tokenId);
        
        console.log(`[Tx Sent] Hash: ${tx.hash}`);

        // 5. 台帳を「使用済み」に更新
        // トランザクション送信成功の時点で即座に更新（連打防止）
        gifts[giftIndex].used = true;
        gifts[giftIndex].usedBy = address;
        gifts[giftIndex].txHash = tx.hash;
        gifts[giftIndex].usedAt = new Date().toISOString();

        fs.writeFileSync(DATA_FILE, JSON.stringify(gifts, null, 2));

        // ブロックへの取り込みを待機
        await tx.wait();

        res.json({ success: true, txHash: tx.hash });
        console.log(`[Success] Transferred ID #${tokenId}.`);

    } catch (error) {
        console.error("Transfer Error:", error);

        // エラー内容に応じたメッセージ
        let errorMessage = "転送に失敗しました";
        
        // 管理者がそのIDを持っていない場合のエラー
        if (error.message && error.message.includes("owner query for nonexistent token")) {
             errorMessage = "エラー: 指定IDのトークンが存在しません(Mint忘れ)";
        } else if (error.info && error.info.error && error.info.error.message.includes("ERC721: caller is not token owner or approved")) {
             errorMessage = "エラー: サーバーがそのトークンを持っていません";
        }

        res.status(500).json({ error: errorMessage });
    }
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access public files at: http://localhost:${PORT}/`);
});