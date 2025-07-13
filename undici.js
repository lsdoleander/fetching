
import { request, parseMIMEType, ProxyAgent } from 'undici'
import { socksDispatcher } from 'fetch-socks'
import { load } from 'cheerio'

import qs from 'node:querystring'


/*export default function client(host) {
	if (URL.canParse(host)){
		return API(new URL(host))
	} else {
		throw new Error("initialize with URL: protocol://host:port only");
	}
}*/

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

function proxyoption(proxy) {
	if (!proxy) return

	const socks = /socks([45]):\/\/(([^:]*):([^@]*)@)?([^:]*):(\d+)/;
	if (socks.test(proxy)){
		let parts = proxy.match(socks);

		let opts = {
		    type: parts[1],
		    host: parts[5],
		    port: parts[6]
		};
		if (parts[2]) {
		    opts.userId = parts[3]
		    opts.password = parts[4]
		}

		return { dispatcher: socksDispatcher(opts) };
	} else {
		const http_s = /(https?):\/\/(([^:]*):([^@]*)@)?(.*)/;
		let parts = proxy.match(http_s);
		
		let opts = {
	      uri: `${parts[1]}://${parts[5]}`
	    };
		if (parts[2]) {
		    opts.token = `Basic ${Buffer.from(parts[2]).toString('base64')}`;
		}
		return { dispatcher: new ProxyAgent(opts) };
	}
}

/*function API(url) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

	#const client = new Client(url.origin);*/

	export function head(path, { headers, cookies, token, query, proxy }){
		return new Promise(async resolve=>{
			let opts = { path, method: "HEAD" };
			if (headers) opts.headers = headers;
			else opts.headers = {};
			opts.headers["Host"] = new URL(path).hostname;
			if (token) opts.headers["Authorization"] = `Bearer ${token}`;
			if (cookies) opts.headers["Cookie"] = Cookie.stringify(cookies);
			if (query) opts.query = query;
			
			const { statusCode, headers: rh } = await request(opts, proxyoption(proxy));
		
			resolve({
				ok: statusCode === 200,
				status: statusCode,
				headers: rh,
				cookies: Cookie.parse(rh)
			});
		});
	}

	export function get(path, { headers, cookies, token, query, proxy }){
		return new Promise(async resolve=>{
			let opts = { path, method: "GET" };
			if (headers) opts.headers = headers;
			else opts.headers = {};
			opts.headers["Host"] = new URL(path).hostname;
			if (token) opts.headers["Authorization"] = `Bearer ${token}`;
			if (cookies) opts.headers["Cookie"] = Cookie.stringify(cookies);
			if (query) opts.query = query;
			
			const { statusCode, headers: rh, body } = await request(opts, proxyoption(proxy));
			let ct = rh["content-type"];
			let mimetype = ct ? parseMIMEType(ct) : null;

			resolve(await bodytype(mimetype, body, {
				ok: statusCode === 200,
				status: statusCode,
				headers: rh,
				cookies: Cookie.parse(rh)
			}));
		});
	}

	export function post(path, { headers, cookies, token, proxy, redirect, form, json, text }){
		return new Promise(async resolve=>{
			let opts = { path, method: "POST" };
			if (headers) opts.headers = headers;
			else opts.headers = {};
			opts.headers["Host"] = new URL(path).hostname;
			if (token) opts.headers["Authorization"] = `Bearer ${token}`;
			if (cookies) opts.headers["Cookie"] = Cookie.stringify(cookies);
			if (redirect) opts.redirect = redirect;

			if (json) {
				opts.body = (typeof json === "object") ? JSON.stringify(json) : json;
				opts.headers["Content-Type"] = "application/json; charset=utf-8";
			} else if (form) {
				opts.body = (typeof form === "object") ? qs.stringify(form) : form;
				opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
			} else if (text) {
				opts.body = text;
				opts.headers["Content-Type"] = "text/plain";
			}
			if (opts.body) {
				opts.headers["Content-Length"] = opts.body.length;
			}

			const { statusCode, headers: rh, body } = await request(opts, proxyoption(proxy));
			let ct = rh["content-type"];
			let mimetype = ct ? parseMIMEType(ct) : null;

			resolve(await bodytype(mimetype, body, {
				ok: statusCode === 200,
				status: statusCode,
				headers: rh,
				cookies: Cookie.parse(rh)
			}));
		});
	}

/*	return {
		head,
		get,
		post
	}
}*/

	export default {
		head,
		get, 
		post
	}