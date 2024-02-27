(function(){
    const isLocal = /^(127|localhost)/.test(location.host);
    self.T = new class{
        action = {
            pwa_activate(){
                let elm = document.querySelector('#pwa-register');
                if(elm){
                    elm.showPopover();
                    setTimeout(()=>location.reload(),1000);
                }

            }
        };
        async postMessage(data,swc){
            let ctrl = swc||(await navigator.serviceWorker.ready).active;
            return ctrl.postMessage(data)
        }
        async postMethod(method,swc){
            return this.postMessage({method},swc);
        }
        postReg(swc){
            return this.postMethod('register',swc)
        }
        async unregister(){
            (await navigator.serviceWorker.ready).unregister();
        }
        async ReadMessage(event){
            let data = event.data;
            let source = event.source;
            if(isLocal)console.log(data);
            if (data&&data.constructor.name === 'Object') {
                let clientID = data.clientID;
                let method = data.method;
                if(clientID&&this.action[clientID] instanceof Function){
                    await this.action[clientID](data,source);
                }else if(method){
                    if(this.action[method] instanceof Function){
                        await this.action[method](data,source);
                    }else{
                        switch(method){
                            case 'notice':{
                                let dialogElm = document.querySelector('#pwa-notice');
                                dialogElm.querySelector('.content').innerHTML = data.result||'更新成功';
                                dialogElm.showPopover();
                            }
                        }
                    }
                }
                clientID = null;
                method = null;
                data = null;
            }
        }
        async addJS(src){
            return new Promise((back,error)=>{
                let script = document.createElement('script');
                script.addEventListener('load',function(){
                    back(this);
                });
                script.addEventListener('error',function(){
                    error(this);
                });
                script.src = src;
                document.body.appendChild(script);
            })
        }
        async FetchData(url,type,progress){
            let response = await fetch(url);
            if(progress){
                const reader = response.body.getReader();
                const chunks = [];
                const fullsize = parseInt(response.headers.get('content-length')||0);
                const filetype = response.headers.get('content-type')||'application/octet-stream';
                let chunkSize = 0;
                while (true) {
                    const {done,value} = await reader.read();
                    if (done)break;
                    /* 下载进度*/
                    chunks.push(value);
                    chunkSize += value.byteLength;
                    progress(chunkSize,fullsize,value.byteLength);
                }
                response = new Blob(chunks,{type:filetype});
            }
            if(response){
                switch(type){
                    case 'text':{
                        return await response.text();
                    }
                    case 'json':{
                        if(response instanceof Blob){
                            let text = await response.text();
                            return JSON.parse(text);
                        }
                        return await response.json();
                    }
                    case 'blob':{
                        if(response instanceof Blob){
                            return response;
                        }
                        return await response.blob();
                    }
                    case 'u8':
                    default:{
                        return new Uint8Array(await response.arrayBuffer());
                    }
                }
            }
        }
        async toPlay(elm){
            if(elm.disabled)return;
            elm.disabled = !0;
            let src = elm.getAttribute('data-url');
            document.querySelector('.player-video').hidden = !1;
            let video = document.querySelector('video');
            if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = src;
                video.addEventListener('canplay', function () {
                video.play();
                });
            }else{
                if (!self.Hls) {
                    await this.addJS('https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.4/hls.min.js');
                }
                if(Hls.isSupported()){
                    const hls = new self.Hls();
                    elm.hls = hls;
                    hls.loadSource(src);
                    hls.attachMedia(video);
                    video.play();
                }
            }
        }
        async downloadTS(elm){
            if(elm.disabled)return;
            if(elm.getAttribute('data-downurl')){
                return this.download(elm.getAttribute('data-downurl'),elm.getAttribute('data-name')+'.ts');
            }
            elm.disabled = !0;
            let showinfo = str=>{
                elm.innerHTML=str;
            };
            let url = elm.getAttribute('data-url');
            console.log(url);
            const list = [];
            if(!self.m3u8parser){
                showinfo('正在下载流程脚本');
                await this.addJS('/assets/js/lib/m3u8-parser.js');
                await this.addJS('/assets/js/lib/aes-decryptor.js');
            }
            if(url.charAt(0)!=='/')this.readPath(url);
            showinfo('解析文件中');
            let text = await this.FetchData(url,'text');
            if(!text) return showinfo('解析失败');;
            let parser = new m3u8parser(text);
            if (!parser.manifest.segments.length) {
                for(let item of parser.manifest.playlists){
                    //if (item.attributes) Object.assign(ATTR, item.attributes);
                    let nextParser = new m3u8parser(await this.FetchData(this.getPath(item.uri), 'text'));
                    if (nextParser.manifest.segments.length) {
                        list.push(...nextParser.manifest.segments.map(v => {
                            v.uri = this.getPath(v.uri);
                            if (v.key && I.str(v.key.uri)) {
                                if (v.key.uri.charAt(0) == '/') {
                                    v.key.href = this.getPath(v.key.uri);
                                }
                            }
                            return v;
                        }));
                    }
    
                }
            }else{
                list.push(...parser.manifest.segments.map(v => {
                    v.uri = this.getPath(v.uri);
                    if (v.key && I.str(v.key.uri)) {
                        if (v.key.uri.charAt(0) == '/') {
                            v.key.href = this.getPath(v.key.uri);
                        }
                    }
                    return v;
                }));
            }
            let index = 0;
            let nowbuff;
            let keyData = {};
            let chunks = [];
            showinfo('解析完毕,进行下载');
            for(let frag of list){
                let databuf = await this.FetchData(frag.uri,'u8',(loadsize,fullsize,chunksize)=>{
                    let sd = '当前速率'+(chunksize/1024).toFixed(0)+'KB';
                    let cp = fullsize>0?',当前进度'+(loadsize*100/fullsize).toFixed(2)+'%':'';
                    showinfo('下载中:'+(index+1)+'/'+list.length+sd+cp);
                });
                let buffer;
                if (frag.key) {
                    if (frag.key.href) {
                        if (!keyData[frag.key.href]) {
                            let buf = await this.FetchData(frag.key.href);
                            keyData[frag.key.href] = buf.buffer;
                        }
                        buffer = keyData[frag.key.href];
                    }
                    if (!nowbuff || nowbuff != buffer) {
                        index = 0;
                        nowbuff = buffer;
                    }
                    let aes = new AESDecryptor();
                    aes.constructor();
                    aes.expandKey(buffer);
                    databuf = aes.decrypt(databuf.buffer, 0, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, index]).buffer, !0);
                    aes.destroy();
                    aes = null;
                }
                chunks.push(databuf);
                index++;
                //showinfo('完成:'+index+'/'+list.length);
            }
            if(!index) return;
            let downurl = URL.createObjectURL(new Blob(chunks,{type:'video/mp2t'}));
            if(elm)elm.setAttribute('data-downurl',downurl);
            this.download(downurl,elm.getAttribute('data-name')+'.ts');
            elm.disabled = !1;
            showinfo('下载完毕');

        }
        download(url,name){
            let a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            a.remove();
        }
        readPath(url){
            let urlInfo = new URL(url);
            this.origin = urlInfo.origin;
    
        }
        getPath(str, bool) {
            if (this.origin&&str.charAt(0) == '/' && str.charAt(1) != '/') {
                str = this.origin+str;
            } else if (str.indexOf('http') === 0 && bool) {
                this.readPath(str);
            }
            return str;
        }
        upload(){
            let T = this;
            let upload = document.createElement('input');
            upload.type = 'file';
            upload.addEventListener('change',function(){
                T.postMessage({
                    method:'upload',
                    result:Array.from(this.files)
                });
                this.remove();
            },{once:!0});
            upload.addEventListener('cancel',function(){
                this.remove();
            },{once:!0});
            upload.click();
        }
    }
    let sw = navigator.serviceWorker;
    if(!sw){
        return alert('你当前访问协议不支持ServiceWorker,需要HTTPS访问!');
    }
    sw.addEventListener('message',event=>self.T.ReadMessage(event));
    sw.addEventListener('onmessageerror',async event=>{
        let act = await this.ready;
        act.update();
    });
    sw.addEventListener('controllerchange', e =>self.T.postReg(e.active));
    sw.register('/sw-video.js').then(async reg=>{
        console.log(reg.installing?'register':'active');
        if(reg.installing){
            self.T.postReg(reg.installing);
        }
        (reg.active||reg.installing).addEventListener('statechange', e => {
            if(['redundant', 'activated'].includes(e.target.state)){
                self.T.postReg(e.target);
            }
        });
    });
})();