'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const async = require('async');
const request = require('request');
const redis = require('redis');
const Promise = require("bluebird");
const redis_client = Promise.promisifyAll(redis.createClient(  {
  port      : process.env.REDIS_PORT,               // replace with your port
  host      : process.env.REDIS_URL,        // replace with your hostanme or IP address
  password  : process.env.REDIS_PASSWORD,    // replace with your password
}));
// base URL for webhook server
let baseURL = process.env.BASE_URL;

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.Client(config);

//check redis clinet connect 
redis_client.on('error',(err)=> {
  console.log(`Error ${err}`)
  throw new Error.message(err)
})
// create Express app
const app = express();
var user_id='';
app.use('/static', express.static('static'));
app.get('/callback', (req, res) => res.end(`I'm listening. Please access with POST.`));

app.post('/callback', line.middleware(config), (req, res) => {
  if(req.body.destination) {
    console.log(`Desination User ID: ${req.body.destination}`)
  }
  // req.body.events should be an array of events
  if(!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }

  //handle evnets separetely
  Promise.all(req.body.events.map(handleEvent))
    .then(()=>res.end())
    .catch((err)=>{
      console.error(err);
      res.status(500).end();
    });
});

// event handler
function handleEvent(event) {
  switch(event.type){
    case 'message':
      const message = event.message
      switch (message.type){
        case 'text':
          return handleText(message,event.replyToken,event.source);
        default:
          throw new ErrorEvent(`Unkonw message: ${JSON.stringify(message)}`)
      }
    case 'follow':
      return replyText(event.replyToken, '你好 朋友~還請你先設定你');
    case 'postback':
      let data = event.postback.data;
      if (data === 'Setting') {
        redis_client.hset(user_id.userId,'status','setting')
      }
      return replyText(event.replyToken, `已經進入設定模式 \n 輸入#加上股票代碼來建立股票 \n EX: #2330`);
  }
}
const replyText = (token, texts) => {
  texts = Array.isArray(texts) ? texts : [texts];
  return client.replyMessage(
    token,
    texts.map((text) => ({ type: 'text', text }))
  );
};
async function handleText(message,replyToken,source){
  console.log(`Echo messge to ${replyToken}: ${message.text}`);
  const buttonsImageURL = `${baseURL}/static/fugle.png`;
  var rc
  user_id = await client.getProfile(source.userId)
  console.log(user_id)
  let status = await redis_client.hgetAsync(user_id.userId,'status');
  console.log(status)
  if(!status)
  {
    redis_client.hset(user_id.userId,'status','setting')
    return replyText(replyToken,'請先設定股票 \n 輸入#加上股票代碼來建立股票 \n EX: #2330')
  }

  switch(status){
    case 'setting':
      if(message.text[0]==='#')
      {
      //stock setting need to write to redis
      //check stock
        let stock_id = message.text.slice(1,5)
        rc = await getFCNTdata(`https://www.fugle.tw/api/v1/data/new_content/FCNT000001?symbol_id=${stock_id}`)
        if(JSON.parse(rc).rawContent)
        {
          let info = JSON.parse(rc).rawContent.shortName
          redis_client.hmset(user_id.userId,'status','report' ,'stock',stock_id)
          return replyText(replyToken,`設定股票 ${info} \n\n請隨便對我輸入文字就可以知道我的功能喔~`)
        }
        else
        return replyText(replyToken,`找不到這支股票`)
      }
      else{
        switch(message.text){
          default:
            return replyText(replyToken,'請先設定股票 \n 輸入#加上股票代碼來建立股票 \n EX: #2330')
        }
      }
  case 'report':
      let stock_id = await redis_client.hgetAsync(user_id.userId,'stock');
      console.log(stock_id)
      if(stock_id){
        switch(message.text){
          case 'status':
            let status = await redis_client.hgetAsync(user_id.userId,'status');
            console.log("User ID: " + JSON.stringify(test));
            return replyText(replyToken,`${test}`)
          case '顯示股價':
            let info = []
            rc = await getFCNTdata(`https://www.fugle.tw/api/v1/data/new_content/FCNT000001?symbol_id=${stock_id}`)
            let stock_info =JSON.parse(rc).rawContent
            info.push(`名稱: ${stock_info.shortName} \n代碼: ${stock_info.symbolId}`)
            rc = await getFCNTdata(`https://www.fugle.tw/api/v1/data/new_content/FCNT000099?symbol_id=${stock_id}`)
            let lastday_info= JSON.parse(rc).rawContent.day.pop();
            info.push(`\n日期: ${lastday_info.date} \n成交價格: ${lastday_info.close} \n漲跌: ${lastday_info.change} \n漲跌幅: ${lastday_info.change_rate}% \n成交量: ${lastday_info.volumeOrAmount}`)
            return replyText(replyToken,`${info}`)
          case '顯示新聞':
              rc= await getFCNTdata(`https://www.fugle.tw/api/v1/data/new_content/FCNT000050?symbol_id=${stock_id}`)
              if(JSON.parse(rc).rawContent){
                let NEWS= JSON.parse(rc).rawContent.map(info=>{
                  return info.title + "\n" + info.url
                })
                return replyText(replyToken,NEWS.join('\n\n'))
              }
              else{
                return replyText(replyToken,'找不到相關的新聞')
              }
          case '顯示PTT新聞':
              rc = await getFCNTdata(`https://www.fugle.tw/api/v1/data/new_content/FCNT000073?symbol_id=${stock_id}`)
              if(JSON.parse(rc).rawContent){
                let PTT_NEWS= JSON.parse(rc).rawContent.map(info=>{
                  return info.title + "\n" + info.url
                })            
                return replyText(replyToken,PTT_NEWS.join('\n\n'))
              }
              else{
                return replyText(replyToken,'找不到相關的PTT新聞')
              }
          default:
            return client.replyMessage(
              replyToken,
              {
                type: 'template',
                altText: 'Buttons alt text',
                template: {
                  type: 'buttons',
                  thumbnailImageUrl: buttonsImageURL,
                  title: '功能',
                  text: '可以透過下列功能才操作我喔~ \n股票功能',
                  actions: [
                    { label: '股價', type: 'message', text: '顯示股價' },
                    { label: '新聞', type: 'message', data: 'news' ,text:'顯示新聞' },
                    { label: 'PTT新聞', type: 'message' ,text:'顯示PTT新聞' },
                    {label :'設定股票',type: 'postback', data: 'Setting'},
                  ],
                },
              }
            );
        }
      }
  default:      
      return replyText(replyToken,message.text)
  }
}

function getFCNTdata(url) {
  return new Promise(function (resolve, reject) {
    request(url, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}
// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});