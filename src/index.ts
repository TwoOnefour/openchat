import { JSEncrypt } from "JSEncrypt";
import CryptoJS from "crypto-js";

interface Env {
  MESSAGES_KV: KVNamespace
	USERCOOKIES_KV: KVNamespace
	TELEGRAM_USER: string
	TELEGRAM_BOT_TOKEN: string
	D1: D1Database
	MY_BUCKET: R2Bucket
	BUCKET_URL:string
}

type D1Data = {
	count: number
}
let firstRun: boolean = true
let aesKey: string
const cryptoObj = new JSEncrypt()
import { v4 as uuidv4 } from "uuid"
import { errors } from 'wrangler';
const endpoint = "*"
// const endpoint = "http://localhost:3000"
const optionHeaders = {
						'Access-Control-Allow-Origin': endpoint,
						'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
						'Access-Control-Allow-Headers': '*',
						'Access-Control-Max-Age': '86400',
				}
type Message = {
    id: number
    text: string
    timestamp: number
    userId: string
	  time: string
}
type D1Message = {
	messageid: number
	text: string
	timestamp: number
	userId: string
	sendtime: string
}
type EncryptedData = {
	data: string
	t: string
}
type ClientData = {
	sign: string,
	message: Message
}
function getTime() {
const now = new Date();

	// 格式化为中国时区的时间
	const chinaTime = new Intl.DateTimeFormat("zh-CN", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false, // 使用 24 小时制
	}).format(now);

	// 将格式转换为 YYYY-MM-DD HH:mm:ss
	const formattedTime = chinaTime
		.replace(/\//g, '-') // 将 / 替换为 -
		.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3'); // 确保日期格式为 YYYY-MM-DD
	return formattedTime
}
function ReturnNotAllow(){
    return Response.json({
            code: 400,
            data: {msg: "Not allowed."}
        }, {headers: {"Content-Type": "application/json; utf-8","Access-Control-Allow-Origin": endpoint,}, status: 400})

}
async function validateRequest(json){
	// cryptoObj.encrypt(JSON.stringify({...json, "t": uuid}))
	const plainText = cryptoObj.decrypt(json.data)
	const plainJson = JSON.parse(plainText)
	if (plainJson.t && plainJson.t === json.t)
		return plainJson
}
export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (firstRun){
			firstRun = false
			await onFirstRun(env)
		}
		const url = new URL(request.url)
		switch (url.pathname){
			case "/api/user":
				return await userApiHandler(request, env, ctx)
			case "/api/sse":
				return await onUserSSErequest(request, env, ctx)
			case "/api/chat":
				return await userChatMessageHandler(request, env, ctx)
			case "/api/updatemsg":
				return await updateMsgApiHandler(request, env, ctx)
			case "/api/replyfromtg":
				return await userReplyFromTG(request, env, ctx)
			case "/api/upload":
				return await userUploadHandler(request, env, ctx)
			case "/api/publickey":
				return await userGetPublicKey(request, env, ctx)
			default:
				return new Response("not permitted", {status:400})
		}

	},
} satisfies ExportedHandler<Env>;
async function userChatMessageHandler(request: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext): Promise<Response>{
		if (request.method === "POST"){
			  if (request.headers.get("Content-Type") !== "application/json; utf-8")
        	return ReturnNotAllow()

				const encryptedDataJson :  ClientData = await request.json()
			  const checkSignMessage = async () => {
					// check validateRequest(JSON.parse(sign)) === true
					// && validateRequest(JSON.parse(sign)).timestamp === message.timestamp
					// && validateRequest(JSON.parse(sign)).userId === message.timestamp
					const plainSign = await validateRequest(JSON.parse(encryptedDataJson.sign))
					if (!plainSign)
						return

					if (plainSign.timestamp !== encryptedDataJson.message.timestamp || plainSign.userId !== encryptedDataJson.message.userId)
						return

					return encryptedDataJson.message
				}

			  let data = {...await checkSignMessage()}
			  if (!data)
					return ReturnNotAllow()

			  // const messageLength = await GetCount(env)

			  await AddCount(env)
			  // 比如客户端有4条消息，发了一条消息，消息应该是4
			  // 这里需要判断一下消息id,
			  // 如果小于等于消息总长则判断为此时客户端并没有更新消息，
			  //  将消息id修改并将此id返回给客户端要求客户端修改消息id
			  // let preMessage: Message[] = [];

				const insert_result = await env.D1.prepare("INSERT INTO user_messages (userId, timestamp, time, text) values (?, ?, ?, ?)").bind(
					data.userId,
					data.timestamp,
					data.time,
					data.text
				).run()
			  data.id = insert_result.meta.last_row_id
			  ctx.waitUntil(telegramReminder(data.text, env))
				return Response
					.json(
						{
							code: 200,
							data: CryptoJS.AES.encrypt(JSON.stringify({msg: "ok", content: [data]}), aesKey).toString()
						},
						{
							headers:
							{
									"Access-Control-Allow-Origin": endpoint,
									"Access-Control-Allow-Headers": "*",
									"Access-Control-Allow-Methods": "GET, POST"
							}
						}
					)
		}
		else if (request.method === "OPTIONS")
			return await ReturnOptions()
		return ReturnNotAllow()
}
async function userReplyFromTG(request: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext): Promise<Response> {
	 const data = await request.json()
	 if (!data.message)
		 return ReturnNotAllow()
	 if (data.message.chat.id.toString() !== env.TELEGRAM_USER)
		 return new Response("ok but not allowed")

	 const sendMessages = async () =>{
		 await AddCount(env)
		 const message : Message = {
			 text: data.message.text,
			 timestamp: new Date().getTime(),
			 userId: "admin",
			 time: getTime()
		 }

			await env.D1.prepare("INSERT INTO user_messages (userId, timestamp, time, text) values (?, ?, ?, ?)").bind(
				message.userId,
				message.timestamp,
				message.time,
				message.text
			).run()
	 }

	 await sendMessages()
	 return new Response("ok")
}
async function userApiHandler(request1: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext): Promise<Response>{
	const request = new Request(request1)
	const newUrl = new URL(request.url)
	if (request.method !== "POST")
		return new Response("Method not permitted.", {status: 400})

	const cache = await caches.default.match(newUrl)
	if (cache)
		return cache
	try {
		const json = await request.json()
		const data = await validateRequest(json)
	  if (!data)
			return ReturnNotAllow()

		if (!data.hasOwnProperty("userId")){
			const uuid = uuidv4()

			const response = Response.json(
				{code: 200, data: {msg: "ok", content: {userId: uuid}}},
				{headers:
						{
							"Access-Control-Allow-Origin": endpoint
						}}
			)

			await env.USERCOOKIES_KV.put(uuid, "true")

			return response
		}

		const users = await env.USERCOOKIES_KV.get(data.userId);
		if (!users){
			await env.USERCOOKIES_KV.put(data.userId, "true")
		}

		const response = Response.json({code: 200, data: {msg: "ok", content: {userId: data.userId}}}, {headers: {
			"Set-Cookie": `userId=${data.userId}; Path=/; Expires=Thu, 31 Dec 2099 23:59:59 GMT; HttpOnly`,
			"Access-Control-Allow-Origin": endpoint
		}})

		await caches.default.put(newUrl, response.clone())

		return response;
	} catch (e) {
		return new Response(e.message, { status: 500 });
	}
}
async function updateMsgApiHandler(request: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.method === "OPTIONS"){
				return await ReturnOptions()
		}
	  else if (request.method !== "POST")
				return ReturnNotAllow()
	  // if (request.headers.get("referer").in `${endpoint}/`)
		// 		return ReturnNotAllow()

	  try {
				const tmpUrl = new URL(request.url)
			  const messageLength = await GetCount(env)
			  const json = await request.json()

				const clientMessagesCountJson = await validateRequest(json)
			  if (!clientMessagesCountJson.t)
					return ReturnNotAllow()
			  else if (clientMessagesCountJson.t !== json.t)
					return ReturnNotAllow()
			  const clientMessagesCount = clientMessagesCountJson._messagesCount
				if (clientMessagesCount > messageLength)
						return ReturnNotAllow()
				// 这里如果没更新必然是等于的

				if (clientMessagesCount === messageLength)
						return Response
							.json(
								{
									code: 200,
									data: CryptoJS.AES.encrypt(JSON.stringify({
										msg: "Already newest.",
										content: []
									}), aesKey).toString()
								},
								{
									headers:
									{
										...optionHeaders,
										"Cache-Control": "no-store, max-age=0",
										"Pragma": "no-cache"
									}
								})
				// 这里是真正查询的地方

				return Response
					.json(
					{
						code: 200,
						data: CryptoJS.AES.encrypt(JSON.stringify({
							msg: "expired",
							content: await getMessageFromD1(env, clientMessagesCount)
						}), aesKey).toString()
					},
					{
						headers: {
							...optionHeaders,
							"Cache-Control": "no-store, max-age=0",
							"Pragma": "no-cache"
						}
					})
		}catch (e){
			return ReturnNotAllow()
		}

}

async function userGetPublicKey(request, env, ctx){
	if (request.method === "OPTIONS")
		return await ReturnOptions()
	if (request.method !== "POST")
		return ReturnNotAllow()
	try{
		  const data = await request.json()

			const plainbytes  = CryptoJS.AES.decrypt(data.data, aesKey)
			const plaintext = plainbytes.toString(CryptoJS.enc.Utf8);
			if (plaintext !== "qaq")
				return ReturnNotAllow()
			const newRequestUrl = new URL(request.url)
			const cache = await caches.default.match(newRequestUrl)
			if (cache){
				return cache
			}
			const publickey = await env.USERCOOKIES_KV.get("publickey")
      // console.log(publickey)
			const responseData = {
				code: 200,
				data: CryptoJS.AES.encrypt(JSON.stringify({
					msg: "ok",
					content: {
						"publicKey": publickey
					}
				}), aesKey).toString()
			}
			const headers = {
				...optionHeaders,
				"Content-Type": "application/json"
			}
			const response = new Response(JSON.stringify(responseData), {headers: headers})
			ctx.waitUntil(caches.default.put(newRequestUrl, response.clone()))
			return response
	}catch (e){
		return new Response(e.message, {headers: optionHeaders})
	}

}
async function userUploadHandler(request: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext): Promise<Response>{
      if (request.method === "OPTIONS")
				return await ReturnOptions()
			// await new Promise(resolve => {
			// 	setTimeout(resolve, 1000);
			// });
	    // return await ReturnNotAllow()
	    const formData = await request.formData()
      const photo : File = formData.get('file')
      if (!photo) return new Response("Invalid File upload.", { status: 401 });
      await env.MY_BUCKET.put("comment/upload/" + photo.name, photo.stream());
      const responseObject = {
            "status": true,
            "data": {
                "links" : {
                  "url": env.BUCKET_URL + "/comment/upload/" + photo.name
                }
            }
        }

      const headers =  {
          'Access-Control-Allow-Origin': endpoint, // Or your specific origin
          'content-type': 'application/json;charset=UTF-8',
      }

      return Response.json(responseObject, {
          headers: headers
      });
}
async function streamEvent(env:Env) : Promise<|undefined> {
	const pollDatabase = async () => {

	}
	for (let i = 0; i < 20; i++) {

		await new Promise(resolve => {
			setTimeout(resolve, 1000);
		});
	}
}
async function onUserSSErequest(request: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext): Promise<Response>{


	  if (request.headers.get('accept') === 'text/event-stream'){
			const eventStreamResponse = new Response(streamEvent())
			eventStreamResponse.headers.set("Cache-Control", "no-cache");
			eventStreamResponse.headers.set("Content-Type", "text/event-stream")

		}


}
async function getMessageFromKV(env: Env, start: number){
	    // Deprecated
			let KVNamespaceListResult = []

	    const messageLength = await GetCount(env)
			for (let i = start; i < messageLength; i++){
				const data = await env.MESSAGES_KV.get(`${i}`)
				if (data === null)
					continue
				KVNamespaceListResult.push(JSON.parse(data))
			}

			return KVNamespaceListResult
}
async function getMessageFromD1(env, start: number){
	let D1DataBaseListResult = await env.D1
		.prepare("select * from user_messages where id > ? ORDER BY timestamp")
		.bind(start)
		.all()
	;
	return D1DataBaseListResult.results
}
async function telegramReminder(message: string, env: Env) : Promise<Response>{
	try {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
			method: "POST", body: JSON.stringify({
				chat_id: env.TELEGRAM_USER,
				text: `你的匿名聊天室有新消息啦\n\n${message}`
			}), headers: { "Content-Type": "application/json" }
		})
	} catch (e){

	}
}
async function ReturnOptions(){
			return new Response("ok", {
				headers: optionHeaders
			})
}
async function onFirstRun(env: Env){
	// const result = await env.DB.prepare('SELECT * FROM counter WHERE name = ?')
	// 	.bind("count")
	// 	.first<DBStructor>()
	// if (!result) return
	const D1ListResult = await env.D1.prepare("SELECT COUNT(id) FROM user_messages;").run();
	await env
		.D1
		.prepare("UPDATE counter set count = ?")
		.bind(D1ListResult.results[0]["COUNT(id)"])
		.run()
	aesKey = await env
		.USERCOOKIES_KV.get("aesKey")
	cryptoObj.setPrivateKey(await env.USERCOOKIES_KV.get("privatekey"))
}
async function GetCount(env:Env): Promise<number|undefined>{
	const count = (await env.D1.prepare("SELECT * FROM counter").first<D1Data>())?.count
	return count
}
async function AddCount(env:Env){
	await env.D1.prepare("UPDATE counter SET count = count + 1").run()
}
