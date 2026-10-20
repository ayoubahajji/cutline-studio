'use strict';
const path=require('node:path');
function configuration(resources){
 const root=path.join(resources,'mcp-runtime');
 return {mcpServers:{cutline_studio:{command:path.join(root,'bin/node'),args:[path.join(root,'mcp/server.cjs')]}}};
}
function codexCommand(resources){const c=configuration(resources).mcpServers.cutline_studio;const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";return 'codex mcp add cutline_studio -- '+[c.command,...c.args].map(quote).join(' ');}
module.exports={configuration,codexCommand};
