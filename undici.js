
import { Client, request, fetch, parseMIMEType, ProxyAgent } from 'undici'
import { socksDispatcher } from 'fetch-socks'
import { load } from 'cheerio'

import qs from 'node:querystring'

const Cookie = {
	stringify(cookies) {
		let output = ""
		for (let key in cookies) {
			if (output !== "") output += "; ";
			output += `${key}=${cookies[key]}`;
		}
		return output;
	},
	parse(headers) {
		let ckmap = {};
		if (headers["set-cookie"]){
			let gsch = headers["set-cookie"];
			if (typeof gsch === "string") gsch = [ gsch ]; 
			for (let csh of gsch) {
				let parts = csh.match(/^([^=]*)=([^;]*)/);
				if (parts) ckmap[parts[1]]=parts[2]
			}
		}
		return ckmap;
	}
}

function bodytype(mimetype, body, output) {
	return new Promise(async btresolve=>{
		if (mimetype === null) {
			output.text = function(){
				return new Promise(resolve=>{
					resolve (text);
				})
			}
			
		} else if (mimetype.type === "text" || /(json|xml)/.test(mimetype.subtype)){
			let text = await body.text();
			if (/(x?html|xml)/.test(mimetype.subtype)) {
				output.dom = function() {
					return new Promise(async resolve=>{
						resolve(load(text));
					})
				}
			}
			output.text = function(){
				return new Promise(resolve=>{
					resolve (text);
				})
			}
			if (/json/.test(mimetype.subtype)) {
				output.json = function(){
					return new Promise(resolve=>{
						resolve (JSON.parse(text));
					})
				}
			}

		} else {
			let b = await body.arrayBuffer();
			output.arrayBuffer = function() {
				return new Promise(async resolve=>{
					resolve(b);
				})
			}
		}
		
		btresolve(output);
	})
}

function proxyrequest(proxy, logger, path, task) {
	const socks = /socks([45]):\/\/(([^:]*):([^@]*)@)?([^:]*):(\d+)/;

	if (!proxy) {
		const client = new Client(new URL(path).origin);
		task.path = path;
		return client.request(task);

	} else if (socks.test(proxy)){
		let parts = proxy.match(socks);

		let opts = {
		    type: parseInt(parts[1]),
		    host: parts[5]
		};
		if (parts[6]) opts.port = parseInt(parts[6])
		if (parts[2]) {
		    opts.userId = parts[3]
		    opts.password = parts[4]
		}

		if (logger) logger.debug(opts);
		task.dispatcher = socksDispatcher(opts, {
		    connect: {
		        rejectUnauthorized: false,
		    },
		});

		return request(path, task);

	} else {
		const http_s = /(https?:\/\/)(?:([^:]*:[^@]*)@)?(.*)/;
		let parts = proxy.match(http_s);

		let opts = {
	    	uri: `${parts[1]}${parts[3]}`,
	      	requestTls: {
		         rejectUnauthorized: false,
		    }
	    };
		if (parts[2]) {
		    opts.token = `Basic ${Buffer.from(parts[2]).toString('base64')}`;
		}

		if (logger) logger.debug(opts);
		task.dispatcher = new ProxyAgent(opts);

		return request(path, task);
	}
}

function dispatchoptions({ path, headers, cookies, token, method, logger, query, body, redirect }){
	let opts = { method };
	if (headers) opts.headers = headers;
	else opts.headers = {};
	opts.headers["Host"] = new URL(path).hostname;
	if (token) opts.headers["Authorization"] = `Bearer ${token}`;
	if (cookies) opts.headers["Cookie"] = Cookie.stringify(cookies);
	if (query) opts.query = query;
	if (body) opts.body = body;	
	if (redirect) opts.redirect = redirect;
	if (logger) logger.debug(opts);
	return opts;
}

function mime(headers){
	let content = headers["content-type"];
	return content ? parseMIMEType(content) : null;
}

const defaultlogger = {
	log: console.log,
	debug (...msg){
		if (process.argv.includes("--verbose")) console.debug(...msg);
	}
}

export function head(path, options={}){
	return new Promise(async resolve=>{
		try {
			const { headers, cookies, token, query, proxy, logger=defaultlogger } = options;
			let opts = dispatchoptions({ method: "HEAD", path, headers, cookies, token, query, logger });
			const { statusCode, headers: rh } = await proxyrequest(proxy, logger, path, opts);
		
			resolve({
				ok: statusCode === 200,
				status: statusCode,
				headers: rh,
				cookies: Cookie.parse(rh)
			});
			
		} catch (e) {
			resolve({
				ok: false,
				error: e,
				status: 400
			})
		}
	});
}

export function get(path, options={}){
	return new Promise(async resolve=>{
		try {
			const { headers, cookies, token, query, proxy, logger=defaultlogger } = options;
			let opts = dispatchoptions({ method: "GET", path, headers, cookies, token, query, logger });
			const { statusCode, headers: rh, body: rb } = await proxyrequest(proxy, logger, path, opts);
			let mimetype = mime(rh);

			resolve(await bodytype(mimetype, rb, {
				ok: statusCode === 200,
				status: statusCode,
				headers: rh,
				cookies: Cookie.parse(rh)
			}));
		} catch (e) {
			resolve({
				ok: false,
				error: e,
				status: 400
			})
		}
	});
}

export function post(path, options={}){
	return new Promise(async resolve=>{
		try {
			const { headers, cookies, token, redirect, form, json, text, proxy, logger=defaultlogger } = options;

			let body;
			if (json) {
				body = (typeof json === "object") ? JSON.stringify(json) : json;
				headers["Content-Type"] = "application/json; charset=utf-8";
			} else if (form) {
				body = (typeof form === "object") ? qs.stringify(form) : form;
				headers["Content-Type"] = "application/x-www-form-urlencoded";
			} else if (text) {
				body = text;
				headers["Content-Type"] = "text/plain";
			}
			if (body) {
				headers["Content-Length"] = body.length;
			}

			let opts = dispatchoptions({ method: "POST", path, headers, cookies, token, redirect, body, logger });
			const { statusCode, headers: rh, body: rb } = await proxyrequest(proxy, logger, path, opts);
			let mimetype = mime(rh);

			resolve(await bodytype(mimetype, rb, {
				ok: statusCode === 200,
				status: statusCode,
				headers: rh,
				cookies: Cookie.parse(rh)
			}));
		} catch (e) {
			resolve({
				ok: false,
				error: e,
				status: 400
			})
		}
	});
}

export default {
	head,
	get, 
	post
}
