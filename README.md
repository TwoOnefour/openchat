# 前瞻
可依托于cloudflare worker的高sla服务创建一个轻量级私人聊天室

使用cloudflare worker + d1 + kv实现, 前端使用nextjs框架

前端请见[twoonefour/openchat-next](https://github.com/twoonefour/openchat-next)

必填参数请见项目中`wrangler.toml.example`

**已实现**

- 实现用户cookie
- 认证
- 上传文件
- 异步消息同步
- 后端api加密防止非法请求数据库篡改
- telegram订阅消息提示

# 部署
复制`wrangler.toml.example`为`wrangler.toml`，填入里面备注的必须参数

`yarn install`下载依赖后使用wrangler部署即可 -》 `wrangler deploy`

前端则是`next build`后，上传静态到page即可，注意修改前端的endpoint指向你的worker，位于`openchat-next/app/page.tsx`第39行
```
// const endpoint = "https://chat-one-api.voidval.com"
const endpoint = "http://127.0.0.1:8787"
```
[演示站点此进入](https://chat-one.voidval.com)

效果如下
![](https://bucket.voidval.com/upload/2025/06/2fa9949b6f9741e81435f65d6c5ace37.png)

![](https://bucket.voidval.com/upload/2025/06/654a85d2ca435144377f0f59ecd0d702.png)

![](https://bucket-qn-cdn.lucianawa.cn/upload/2025/06/654a85d2ca435144377f0f59ecd0d702.png)

![](https://bucket.voidval.com/upload/2025/06/22ec6b68be353eebc97f302c2773a5e4.png)
