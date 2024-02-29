/**
 * @author Nenge<m@nenge.net>
 * @copyright Nenge.net
 * @license GPL
 * @link https://nenge.net
 * 本功能构建一个虚拟响应服务,利用SQLite作为驱动进行交互
 * 简单路由功能
 *      let params = T.getParams(request.url)
 * 数据库操作 SQLite.js
 *       let db = await T.readSQL();//打开数据库
 *       db.save();储存数据
 *       db.toFree();//查询结束关闭数据库
 *       注:IOS存在问题,不要尝试使用update,应该先删除数据,再添加
 * 简单模板调用并且
 *      let response = await T.getTemplate('/assets/template-index.html');
 *      response =  ejs.compile(response)(templates); //ejs.js模板
 *      ejs.clearCache();
 *      return new Response(new Blob([response],{type:'text/html;charset=utf-8'}));
 * 数据缓存
 *      '-UPLOAD-DATA' 储存本地地址以及图片数据
 *      '-CROSS-IMAGES' 储存远程图片数据
 *      '-CROSS-TS' 储存远程视频ts m3u8 key等数据
 */
"use strict";
const CACHE_NAME = 'N-VIDEO';
const CACHE_SQL_PATH = '/assets/sql.dat';
const version = Date.parse('Wed, 28 Feb 2024 01:20:17 GMT');
const CACHE_ORIGIN = location.origin;
//https://unpkg.com/ejs@3.1.9/ejs.min.js
//https://unpkg.com/sql.js@1.10.2/dist/sql-wasm.js
//https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js
const T = new class {
    async openCache(name){
        let name2 = name?CACHE_NAME+name:CACHE_NAME;
        return await caches.open(name2);
    }
    async LoaclCache(request,cache){
        if(this.isLocal)return await fetch(request);
        if(!cache)cache = await this.openCache();
        let url = request&&request.url?this.toLink(this.toPath(request)):request;
        let response = await cache.match(url);
        if(response&&navigator.onLine){
            let cachetime = response.headers.get('date');
            if(cachetime<version){
                let response2 = await fetch(request).catch(e=>undefined);
                if(response2){
                    cache.put(request,response.clone());
                    return response2;
                }
            }
        }
        if(!response){
            response = await fetch(request);
            response&&cache.put(url,response.clone());
        }
        return response||this.toStatus(404);
    }
    async checkUpate(){
        let cache = await this.openCache();
        let size = 0;
        await Promise.all((await cache.keys()).map(async request=>{
            if(request.url.indexOf(CACHE_SQL_PATH)!== -1) return;
            let modified = (await fetch(request.url+'?'+version,{method:'HEAD'})).headers.get('last-modified');
            let cachetime = (await cache.match(request)).headers.get('last-modified');
            if(modified!=cachetime){
                size ++;
                await cache.put(request,(await fetch(request.url)).clone());
            }
        }));

    }
    async CdnCache(request,NAME){
        let cache = await this.openCache(NAME);
        let response = await cache.match(request);
        if(!response){
            response = await fetch(request).catch(e=>undefined);
            if(response){
                cache.put(request,response.clone());
            }else{
                return this.toStatus(404)
            }
        }
        return response;
    }
    async getMessage(ARG,source){
        const T = this;
        return new Promise(back=>{
            const workerId = T.getRandom();
            T.action[workerId] = function (data){
                if(data.workerId&&T.action[data.workerId]){
                    delete T.action[data.workerId];
                }
                back(data.result);
                data = null;
            };
            ARG.workerId = workerId;
            T.postMessage(ARG,source);
        });
    }
    getRandom(){
        return btoa(crypto&&crypto.randomUUID()||performance.now()+Math.random()).replace(/[^\w]/g,'');
    }
    async getClients(){
        return await self.clients.matchAll();
    }
    async postMessage(str,source) {
        if(source instanceof Promise)source = await source;
        if(source&&source instanceof Client)return source.postMessage(str);
        let clients = await self.clients.matchAll();
        let p  = 0;
        if(clients.length){
            for(let client of clients){
                if(!client||!client.postMessage) break;
                p++;
                if(source){
                    client.postMessage(str);
                }else if(client.visibilityState=='visible'){
                    return client.postMessage(str);
                }
            }
            clients = null;
            str = null;
            if(this.SW)this.SW = null;
        }
        if(!p&&this.SW){
            this.SW.postMessage(str);
        }
    }
    isLocal = /(127\.0\.0\.1|localhost)/.test(location.host);
    Client = undefined;
    toLocation(url){
        return this.toStatus(301,{location:url});
    }
    toStatus(status,headers,data){
        status = status||404;
        return new Response(data,{status,headers});
    }
    toPath(request){
        return (request.constructor===String?request:request.url).replace(CACHE_ORIGIN,'');
    }
    toLink(url){
        return url.split('?')[0];
    }
    toArray(data,fn){
        if(data&&data.constructor!==Array)data = Object.entries(data);
        if(!data||!data.length)return;
        return Array.from(data,fn);
    }
    action = {};
    getParams(url){
        let pathname = url.replace(CACHE_ORIGIN,'').toLowerCase();
        if(!pathname||pathname=='/')pathname = '/?/';
        let params = new Map();
        let i = 1;
        if(pathname.charAt(1)==='?'){
            if(pathname.charAt(2)==='/'){
                pathname = pathname.slice(3);
                params.set('router','index');
                params.set('page',1);
                params.set('order','desc');
                for(let key of pathname.split('/')){
                    params.set(i++,decodeURI(key));
                }
                params.set('page',params.get(1)||1);
                params.set('order',params.get(2)||'desc');
                params.set('tag',decodeURI(params.get(3)||''));
                params.set('search',decodeURI(params.get(4)||''));
            }else if(pathname.indexOf('search=')!==-1){
                params.set('router','index');
                params.set('page',1);
                params.set('order','desc');
                for(let key of pathname.split('?')[1].split('&')){
                    let entry = key.split('=');
                    params.set(entry[0],decodeURI(entry[1]));
                }
                return params;
            }else{
                pathname = pathname.slice(2);
                for(let key of pathname.split('/')){
                    params.set(i++,decodeURI(key));
                }
                if(!isNaN(params.get(1))){
                    params.set('router','play');
                    params.set('id',parseInt(params.get(1)));
                    if(params.get(2))params.set('eq',params.get(2));
                }
            }
        }
        return params;
        let str = pathname[0].split('#')[0];
        if(pathname[1]){
            for(let entry of pathname[1].split('&')){
                let keys = entry.split('=');
                params.set(keys[0],decodeURI(keys[1]||''));
            }
        }
        let index = 0;
        if(/^\/[\w\-]+\.html$/.test(str)){
            for(let value of str.split('.html')[0].split('/').pop().split('-')){
                params.set(index,value);
                index++;
            }
        }else{
            index=-1;
            for(let value of str.split('/')){
                if(index>=0)params.set(index,value);
                index++;
            }
        } 
        if(params.get(0)){
            params.set('router',params.get(0));
        }else{
            params.set('router','index');
        }
        if(!isNaN(params.get(1))){
            params.set('id',params.get(1));
            params.set('order',params.get(2)||'desc');
        }else{
            params.set('order',params.get(1)||'desc');
        }
        return params;
    }
    async initSQL(back){
        let response = await this.CdnCache('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm','-CROSS-JS');
        initSqlJs({
            wasmBinary:new Uint8Array(await response.arrayBuffer())
        });
        this.SQL = await initSqlJsPromise;
        this.SQL.wasmBinary = null;
        delete this.SQL.wasmBinary;
        Object.assign(this.SQL.Database.prototype,{
            T:this,
            fetchArray(sql,params){
                let result = this.exec(sql,params);
                if(result[0]){
                    let data = [];
                    for(let value of result[0].values){
                        data.push(Object.fromEntries(value.map((v,k)=>[result[0].columns[k],v])))
                    }
                    return data;
                }
            },
            fetchFirst(sql,params){
                let result = this.fetchArray(sql,params);
                if(result&&result[0]){
                    return result[0];
                }
            },
            fetchColumns(index,sql,params){
                let result = Object.values(this.fetchFirst(sql,params)||[]);
                if(result.length){
                    return result[index||0];
                }
            },
            fetchResult(sql,params){
                return this.fetchColumns(0,sql,params);
            },
            toFree(){
                this.colse&&this.colse();
                this.T.SQL._sqlite3_free();
                this.T.SQL._free();
            },
            columns:{
                'data':{
                    'id':'int primary key',
                    'title':'char',
                    'type':'char',
                    'url':'char',
                    'img':'char'
                },
                'type':{
                    'name':'char',
                    'num':'int'
                },
                'settings':{
                    'name':'char',
                    'data':'char'
                }
            },
            async save(cache){
                if(!cache)cache = await this.T.openCache();
                let data = this.export();
                await cache.put(
                    CACHE_SQL_PATH,
                    new Response(
                        new Blob(
                            [data],
                            {type:'application/octet-stream'}
                        ),
                        {
                            headers:{
                                'content-length':data.byteLength,
                                'date':new Date().toGMTString()
                            }

                        }
                    )
                );
            },
            /**
             * 加载默认数据
             */
            async load(cache){
                this.T.toArray(this.columns,entry=>{
                    let str = this.T.toArray(entry[1],keys=>{
                        return `\`${keys[0]}\` ${keys[1]}`;
                    }).join(',');
                    this.run(`CREATE TABLE \`${entry[0]}\` (${str});`);
                });
                return this.save();
            },
            /**
             * 写入主数据
             * @param {*} data 
             */
            async zip2Data(data,cache,isadd){
                if(!cache)cache = await this.T.openCache();
                let UploadCache = await this.T.openCache('-UPLOAD-DATA');
                let [checksql,delsql,insertsql,keys] = this.sql_text_by_data();
                this.T.toArray(data,entry=>{
                    if(/\.json$/.test(entry[0])){
                        try{
                            let text = new TextDecoder().decode(entry[1]);
                            let sqldata = JSON?JSON.parse(text):(new Function('return '+text))();
                            this.json2Data(sqldata,checksql,delsql,insertsql,keys,isadd);
                        }catch(e){
                            this.T.postMessage({
                                method:'notice',
                                result:e&&e.message||e,
                            });
                            throw 'zip data error';
                        }
                    }else{
                        let mime = entry[0].split('.').pop();
                        let filetype = /m3u8$/.test(mime)?'application/vnd.apple.mpegURL':/(jpg|png|gif|webp)$/i.test(mime)?'image/'+mime:'application/octet-stream';
                        UploadCache.put(
                            '/upload/data/'+entry[0],
                            new Response(
                                new Blob(
                                    [entry[1]],
                                    {
                                        type:filetype,
                                        'date':new Date().toGMTString(),
                                        'content-length':entry[1].byteLength
                                    }
                                )
                            )
                        );
                    }
                });
                await this.save(cache);
            },
            sql_text_by_data(){
                let keys = Object.keys(this.columns['data']);
                let insertsql = this.getInsert('data',this.getFill(keys),this.getFill(keys,'?'));
                let checksql = this.getSelect('data','`id`',['id']);
                let delsql = this.getDelete('data',['id']);
                return [checksql,delsql,insertsql,keys];
            },
            /**
             * 
             * @param {Object} jsondata 要插入的数据
             * @param {String} checksql 
             * @param {String} delsql 
             * @param {String} insertsql 
             * @param {String} isadd 是否追加
             */
            json2Data(jsondata,checksql,delsql,insertsql,keys,isadd){
                if(!checksql){
                    let sql = this.sql_text_by_data();
                    checksql = sql[0];
                    delsql = sql[1];
                    insertsql = sql[2];
                    keys = sql[3];
                }
                if(jsondata&&jsondata.constructor === Array){
                    for(let items of jsondata){
                        if(isadd)items['id'] = null;
                        this.json2Insert(items,checksql,delsql,insertsql,keys);
                    }
                }else if(jsondata&&jsondata.constructor === Object){
                    for(let id in jsondata){
                        let items = jsondata[id];
                        if(isadd){
                            items['id'] = null;
                        }else if(!items['id']&&!isNaN(id)){
                            items['id'] = parseInt(id);
                        }
                        this.json2Insert(items,checksql,delsql,insertsql,keys);
                    }
                }
            },
            /**
             * 更新数据库
             * @param {JSON} items 更新的JSON值
             * @param {String} checksql 
             * @param {String} delsql 
             * @param {String} insertsql 
             */
            json2Insert(items,checksql,delsql,insertsql,keys){
                if(items['id']){
                    if(this.fetchResult(checksql,[items['id']])){
                        this.run(delsql,[items['id']]);
                    }
                    this.run(insertsql,this.getFillData(keys,!1,items));
                }else{
                    let id = this.query('data',null,null,!1,0,'max(id)');
                    items['id'] = id + 1;
                    this.run(insertsql,this.getFillData(keys,!1,items));
                    
                }
                this.json2type(items['type']);
            },
            /**
             * 写入分类
             * @param {*} data 
             */
            json2type(data){
                data.split(',').forEach(name => {
                    if (name) {
                        let num = this.query('type',{name},null,!1,null,'`num`');
                        if(num&&num>0){
                            this.update('type',{num:num+1},{name});
                        }else{
                            this.insert('type',{name,num:1});
                        }
                    }
                });
            },
            /**
             * 获取主键
             * @param {*} table 
             * @returns 
             */
            getPrimary(table){
                let keys = this.columns[table];
                for(let key in keys){
                    if(keys[key].indexOf('primary')!==-1){
                        return key;
                    }
                }
                return Object.keys(keys)[0];
            },
            /**
             * 获取查询语句
             * @param {*} table 
             * @param {*} column 
             * @returns 
             */
            getSelect(table,column,where,like){
                let str = '';
                column = column===!0?'count(*)':typeof column==='string'&&column?column:'*';
                if(where)str = this.getWhere(where,like);
                return `SELECT ${column} FROM \`${table}\` `+str;
            },
            /**
             * 获取插入语句
             * @param {*} table 
             * @param {*} str 
             * @param {*} str2 
             * @returns 
             */
            getInsert(table,str,str2){
                return `INSERT INTO \`${table}\` (${str}) VALUES(${str2});`;
            },
            getWhere(where,like){
                if(!like)like = '=';
                if(like==!0)like = 'LIKE';
                if(where&&where.constructor === Object)where = Object.keys(where);
                if(where instanceof Array&&where.length)return 'WHERE '+where.map(v=>`${v} ${like} ? `).join(' AND ');
                return '';
            },
            getFill(keys,str,sp,data){
                return this.getFillData(keys,str,data).join(sp||',');
            },
            getFillData(keys,str,data){
                return this.T.toArray(keys,v=>data&&data[v]?data[v]:str?str:'`'+v+'`');
            },
            getUpdate(table,data,where,like){
                return `UPDATE \`${table}\` SET ${data} ${this.getWhere(where,like)} ;`;
            },
            getDelete(table,where,like){
                return `DELETE FROM \`${table}\` ${this.getWhere(where,like)} ;`;
            },
            insert(table,params){
                let keys = Object.keys(this.columns[table]);
                let str = this.getFill(keys);
                let str2 = this.getFill(keys,'?');
                this.run(
                    this.getInsert(table,str,str2),
                    this.getFillData(keys,!1,params)
                );
            },
            update(table,params,where){
                let keys = Object.keys(this.columns[table]);
                if(!where){
                    let name = this.getPrimary(table);
                    let value = params[name];
                    where = {[name]:value};

                }
                let str = [];
                let str2 = [];
                for(let v of keys){
                    if(params[v]!==undefined){
                        str.push(`\`${v}\` = ? `);
                        str2.push(params[v]);
                    }
                }
                str2.push(...Object.values(where));
                return this.fetchResult(
                    this.getUpdate(
                        table,
                        str.join(','),
                        Object.keys(where)
                    ),
                    str2
                );   
            },
            query(table,where,order,limit,like,column){
                let params = [];
                if(where&&where.constructor === Object){
                    params = Object.values(where);
                    where = this.getWhere(Object.keys(where),like);
                }else if(typeof where === 'string'&&!/where/i.test(where)){
                    where = ' WHERE '+where;
                }
                let sql = this.getSelect(table,column);
                if(typeof where === 'string')sql += where;
                if(typeof order === 'string') sql += ' order by '+order;
                if(limit&&limit!==!0) sql += ` limit ${limit}`;
                if(limit===!1) return this.fetchResult(sql,params);
                if(limit===1) return this.fetchFirst(sql,params);
                return this.fetchArray(sql,params);
            },
            count(table,where,like){
                return this.query(table,where,null,!1,like,!0);
            }

        });
        back(!0);
    }
    constructor(){
        this.sqlReady = new Promise(async back=>this.initSQL(back));

    }
    async getTemplate(url,cache){
        return await (await this.LoaclCache(url,cache)).text();
    }
    async readSQL(cache){
        if(!this.SQL)await this.sqlReady;
        if(!cache)cache = await this.openCache();
        let response = await cache.match(CACHE_SQL_PATH);
        if(response){
            response =  (new Uint8Array(await response.arrayBuffer()));
        }
        const db = new this.SQL.Database(response||undefined);
        if(!response){
            await db.load(cache);
        }
        return db;
    }
    async fetchByIndex(params){
        let cache = await this.openCache();
        let response;
        let db = await this.readSQL(cache);
        let templates = {
            title:'首页',
            search:'',
            tagname:'',
            list:[],
            topnav:[],
            navpage:[],
            navtags:[],
            maxnum:0,
            maxpage:0,
            error:'请到[缓存管理]导入数据!',
        };
        if(db){
            response = await this.getTemplate('/assets/template-home.html',cache);
            let where = {};
            let tag = params.get('tag')||'';
            let search = params.get('search')||'';
            let order = params.get('order');
            let page = params.get('page');
            if(!page)page = 1;
            page = parseInt(page);
            let ordertext = '';
            if(tag){
                where['type'] = `%${tag}%`;
                templates.topnav.push(tag);
                templates.tagname = tag;
            }
            if(search){
                where['title'] = `%${search}%`;
                templates.topnav.push(search);
                templates['search'] = search;
            }
            if(order){
                ordertext = order=='asc'?' `id` asc':' `id` desc ';
            }
            let limit = 30;
            let maxnum = db.count('data',where,!0);
            if(maxnum){
                let limitext = ((page-1)*limit)+','+limit;
                let data = db.query('data',where,ordertext,limitext,!0);
                if(data){
                    let UploadCache = await this.openCache('-UPLOAD-DATA');
                    for(let items of data){
                        let itemid = items['id'];
                        let img = items['img'];
                        let imgext = img ? img.split('.').pop():'jpg';
                        let img2 = '/upload/data/'+itemid+'.'+imgext;
                        templates.list.push({
                            url:`/?${items['id']}/`,
                            img:await UploadCache.match(img2)?img2:img,
                            name:items['title']
                        });
                    }
                }
                let maxpage = Math.ceil(maxnum / limit);
                if(page>maxpage)page=maxpage;
                let maxlengh = 8;
                let leftnavs = [];
                let rightnavs = [];
                let endstr = `/${order.toUpperCase()}/${encodeURI(tag)}/${encodeURI(search)}/`;
                endstr = endstr.replace(/[\/]+$/,'/');

                for(let i=0;i<=8;i++){
                    if(i==0||page+i<maxpage){
                        if(page+i==maxpage||page+i==1){
                            continue;
                        }
                        let num = page+i;
                        rightnavs.push([num,`/?/${num}${endstr}`,i==0]);
                        maxlengh--;
                    }
                    if (maxlengh < 0) break;
                    if(i>0&&page-i>1){
                        let num = page-i;
                        leftnavs.unshift([num,`/?/${num}${endstr}`]);
                        maxlengh--;
                    }
                    if (maxlengh < 0) break;
                }
                leftnavs.unshift(['第一页',`/?/1${endstr}`,page==1]);
                rightnavs.push(['最后一页',`/?/${maxpage}${endstr}`,page==maxpage]);
                let tags = db.query('type',null,' `num` desc');
                this.toArray(tags,entry=>{
                    templates.navtags.push([entry['name'],entry['num']]);
                });
                Object.assign(templates,{
                    maxnum,
                    maxpage,
                    navpage:leftnavs.concat(rightnavs)
                });
            }else{
                templates.error = '未能找得到符合条件数据,请返回首页重试!';
            }
            db.toFree();
        }
        if(!response)return this.LoaclCache('/index.html',cache);
        response =  ejs.compile(response)(templates);
        ejs.clearCache();
        return new Response(new Blob([response],{type:'text/html;charset=utf-8'}));
    }
    async fetchByPlay(params){
        let cache = await this.openCache();
        let db = await this.readSQL(cache);
        let response;
        let templates = {
            title:'未找到影片',
            search:'',
            topnav:['影片不存在'],
            m3u8:[],
            imgsrc:'',
            id:0,
            error:'未能找到符合条件影片,请返回首页重试!',
        };
        if(db){
            response = await this.getTemplate('/assets/template-play.html',cache);
            let id = params.get('id');
            let itemdata;
            if(!isNaN(id)){
                itemdata = db.query('data',{id},!1,1);
                if(itemdata){
                    itemdata['id'] = parseInt(itemdata['id']);
                    let UploadCache = await this.openCache('-UPLOAD-DATA');
                    let img = itemdata['img'];
                    let imgext = img ? img.split('.').pop():'jpg';
                    let img2 = '/upload/data/'+itemdata['id']+'.'+imgext;
                    let imgsrc = await UploadCache.match(img2)?img2:img;
                    if(!itemdata['url']){
                        let m3u8 = '/upload/data/'+itemdata['id']+'.m3u8';
                        if(await UploadCache.match(m3u8)){
                            itemdata['url'] = m3u8;
                        }
                    }
                    if(itemdata['url']){
                        let m3u8 = itemdata['url'].split(',');
                        Object.assign(templates,{
                            title:itemdata['title'],
                            search:params.get('search')||'',
                            topnav:[itemdata['title']],
                            imgsrc,
                            m3u8,
                            id:itemdata['id']
                        });
                    }
                }
            }else{

            }
            db.toFree();
        }
        if(!response)return this.LoaclCache('/index.html',cache);
        response =  ejs.compile(response)(templates);
        ejs.clearCache();
        return new Response(new Blob([response],{type:'text/html;charset=utf-8'}));
    }
};
importScripts(
    T.isLocal?'/assets/js/lib/sql.min.js':'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js',
    T.isLocal?'/assets/js/lib/ejs.min.js':'https://unpkg.com/ejs@3.1.9/ejs.min.js',
);
Object.entries({
    install(event) {
        console.log('serviceWorker install');
        return self.skipWaiting(); //跳过等待
    },
    activate(event) {
        console.log('serviceWorker activate');
        return event.waitUntil(new Promise(async ok=>{
            if(T.SW)T.SW.postMessage({method:'pwa_activate'});
            T.SW = null;
            for(let client of await T.getClients()){
                client.postMessage({method:'pwa_activate'});
            }
            ok(self.skipWaiting());
        }));
    },
    fetch(event) {
        const request = event.request;
        let url = T.toPath(request);
        if(url.charAt(0)==='/'){
            url = T.toLink(url);
            if(url === CACHE_SQL_PATH){
                return event.respondWith(T.toStatus(404));
            }else if(url.indexOf('/assets')===0){
                if(T.isLocal) return false;
                return event.respondWith(T.LoaclCache(request));
            }else if(url.indexOf('/upload/data/')===0){
                return event.respondWith(T.CdnCache(request,'-UPLOAD-DATA'));
            }else{
                let last = url.split('/').pop();
                if(['js','dat','png','jpg','gif','ico','md','webp','yml','lock','css','svg'].includes(last)){
                    if(T.isLocal) return;
                    return event.respondWith(T.LoaclCache(request));
                }
                let params = T.getParams(request.url);
                switch(params.get('router')){
                    case 'index':{
                        return event.respondWith(T.fetchByIndex(params));
                        break;
                    }
                    case 'play':{
                        return event.respondWith(T.fetchByPlay(params));
                        break;
                    }
                }
                return event.respondWith(T.toStatus(404));

            }
        }else{
            if(/\.(jpg|gif|webp|png)$/ig.test(url)){
                return event.respondWith(T.CdnCache(request,'-CROSS-IMAGES'));
            }
            if(/\.(ts|key|m3u8)$/ig.test(url)){
                return event.respondWith(T.CdnCache(request,'-CROSS-TS'));
            }
        }
        return false;
    },
    async message(event) {
        let data = event.data;
        let source = event.source;
        if (T.isLocal) console.log(data);
        if (data && !data.hasOwnProperty('prototype')) {
            let id = data.workerId;
            if (T.action[id]) return T.action[id](data,source);
            else{
                let method = data.method;
                let clientID = data.clientID;
                let result = data.result;
                delete data.method;
                delete data.clientID;
                delete data.result;
                switch(method){
                    case 'register':{
                        T.SW = source;
                        break;
                    }
                    case 'add-zip':{
                        if(result){
                            let cache = await T.openCache();
                            let db = await T.readSQL(cache);
                            await db.zip2Data(result,cache,data.isadd);
                            db.toFree();
                            source.postMessage({
                                method:'notice',
                                result:'插入数据已更新',
                                reload:!0
                            });
                        }
                        break;
                    }
                    case 'add-json':{
                        if(result){
                            let cache = await T.openCache();
                            let db = await T.readSQL(cache);
                            db.json2Data(result,null,null,null,null,data.isadd);
                            await db.save(cache);
                            db.toFree();
                            source.postMessage({
                                method:'notice',
                                result:'数据已更新或者追加',
                                reload:!0
                            });
                        }
                        break;
                    }
                    case 'clear':{
                        if(result===undefined&&typeof result !=='string')return ;
                        await caches.delete(CACHE_NAME+result);
                        source.postMessage({
                            method:'notice',
                            result:'数据已删除',
                        });
                        break;
                    }
                    case 'checkurl':{
                        source.postMessage({
                            method:'log',
                            result:T.getParams(result).get('router')
                        });
                        break;
                    }
                    case 'delete-data':{
                        if(result){
                            let cache = await T.openCache();
                            let db = await T.readSQL(cache);
                            let sql3 = db.getDelete('data',['id']);
                            db.run(sql3,[result]);
                            db.save(cache);
                            db.toFree();
                            source.postMessage({
                                method:'notice',
                                result:'此视频数据已删除,请自行返回首页!',
                            });
                        }
                        break;
                    }
                    case 'cachename':{
                        if(clientID){
                            return source.postMessage({
                                result:CACHE_NAME,
                                clientID
                            });
                        }
                        break;
                    }
                    case 'sqlname':{
                        if(clientID){
                            return source.postMessage({
                                result:CACHE_SQL_PATH,
                                clientID
                            });
                        }
                        break;
                    }
                    case 'query-data':{
                        if(result&&clientID){
                            let cache = await T.openCache();
                            let db = await T.readSQL(cache);
                            let data = db.query('data',{id:result},null,1);
                            db.toFree();
                            source.postMessage({
                                clientID,
                                result:data,
                            });
                        }
                        break;
                    }
                }
                result = null;
                clientID = null;
                method = null;
            }
            data = null;
        }
    },
    error(e){
        console.log(e.message);
    }
}).forEach(
    entry => self.addEventListener(entry[0], entry[1])
);