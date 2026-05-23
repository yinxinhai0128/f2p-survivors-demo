# AI Survivor Demo

这是一个用于面试展示的网页小游戏 Demo，项目代码位于：

```text
ai-survivor-demo/
```

技术栈：Phaser + TypeScript + Vite。

## 运行方式

```bash
cd ai-survivor-demo
npm install
npm run dev
```

打开终端提示的本地地址即可试玩，通常是：

```text
http://127.0.0.1:5173/
```

生产构建：

```bash
cd ai-survivor-demo
npm run build
```

## Demo 内容

当前 Demo 实现了《吸血鬼幸存者 like》的最小可行核心循环：

- WASD 控制玩家移动
- 敌人从屏幕四周刷新并追踪玩家
- 玩家自动攻击最近敌人
- 敌人死亡后掉落绿色菱形经验点
- 玩家靠近后吸收经验并升级
- 一局 3 分钟，死亡或存活结束
- 结算页展示存活时间、击杀数、等级和经验
- 预留商业化 mock：广告复活、双倍经验、成长战令入口

更完整的项目说明见：

```text
ai-survivor-demo/README.md
```
