#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {createMcpExpressApp}=require('@modelcontextprotocol/sdk/server/express.js');
const {createTools}=require('./tools.cjs');
const engine=createTools();
function server(){const mcp=new McpServer({name:'cutline-studio',version:'1.0.0'},{instructions:'Cutline edits real local video projects. Read cutline_capabilities and the cutline://guide resource first. Use project_get revision for atomic project_edit calls. Preview frames, validate sources, render, then poll jobs for verified artifacts. Never call a failed job a completed export. Projects are isolated from the desktop autosave; use portable .cutline files for handoff.'});
 for(const tool of engine.definitions)mcp.registerTool(tool.name,{description:tool.description,inputSchema:tool.schema,annotations:{readOnlyHint:tool.readOnly,destructiveHint:false,openWorldHint:false}},async args=>{try{const result=await tool.handler(args);return result?.content?result:engine.textResult(result);}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}});
 mcp.registerResource('editing-guide','cutline://guide',{description:'Cutline editing model, tool workflow, feature map and limitations',mimeType:'text/markdown'},async uri=>({contents:[{uri:uri.href,mimeType:'text/markdown',text:await fs.readFile(path.join(__dirname,'GUIDE.md'),'utf8')}]}));
 mcp.registerPrompt('edit-ecommerce-video',{description:'Plan and deliver a verified local Cutline ecommerce edit.'},async()=>({messages:[{role:'user',content:{type:'text',text:'Use Cutline MCP to edit the video requested in this conversation. Read cutline://guide and cutline_capabilities. Preserve originals and use an isolated project. Build a clear product hook, captions, supporting layers, clean voice audio and a call to action when requested. Preview the opening, transitions and final scene. Render to the requested aspect ratio; poll until output verification succeeds. Deliver both the final MP4 and editable .cutline project. Do not invent product claims.'}}]}));return mcp;
}
async function main(){await engine.store.init();if(!process.argv.includes('--http')){const mcp=server();await mcp.connect(new StdioServerTransport());return;}
 const flag=process.argv.indexOf('--port'),port=flag>=0?Number(process.argv[flag+1]):4180;if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid port.');
 let token=process.env.CUTLINE_MCP_TOKEN;const tokenFile=path.join(engine.store.root,'http-token');if(!token){try{token=(await fs.readFile(tokenFile,'utf8')).trim();}catch{token=crypto.randomBytes(32).toString('hex');await fs.writeFile(tokenFile,token,{mode:0o600,flag:'wx'});}}if(token.length<24)throw new Error('HTTP token must contain at least 24 characters.');
 const app=createMcpExpressApp({host:'127.0.0.1'});
 app.use((req,res,next)=>{const supplied=req.headers.authorization||'',expected='Bearer '+token;if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({error:'Bearer token required.'});if(req.headers.origin)return res.status(403).json({error:'Browser-origin requests are not supported by this server-to-server endpoint.'});next();});
 app.post('/mcp',async(req,res)=>{const mcp=server(),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});res.on('close',()=>{transport.close();mcp.close();});try{await mcp.connect(transport);await transport.handleRequest(req,res,req.body);}catch(error){console.error(error.message);if(!res.headersSent)res.status(500).json({error:'MCP request failed.'});}});
 app.all('/mcp',(_req,res)=>res.status(405).end());
 const listener=app.listen(port,'127.0.0.1',()=>console.error('Cutline MCP: http://127.0.0.1:'+listener.address().port+'/mcp (token file: '+tokenFile+')'));process.once('SIGTERM',()=>{engine.jobs.stop();listener.close(()=>process.exit(0));});
}
process.once('SIGINT',()=>{engine.jobs.stop();setTimeout(()=>process.exit(0),200).unref();});process.once('SIGTERM',()=>{engine.jobs.stop();setTimeout(()=>process.exit(0),200).unref();});process.stdin.on('end',()=>{if(!process.argv.includes('--http'))engine.jobs.stop();});
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={server,engine};
