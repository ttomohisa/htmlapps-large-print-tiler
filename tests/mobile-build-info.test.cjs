const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../src/index.template.html'),'utf8');
const originalBuild="<section class=\"build-section\">\n      <details>\n        <summary data-i18n=\"buildInfo\">ビルド情報</summary>\n        <div class=\"build-grid\">\n          <div class=\"build-item\"><span data-i18n=\"appVersion\">アプリバージョン</span><strong id=\"buildVersion\">—</strong></div>\n          <div class=\"build-item\"><span data-i18n=\"builtAt\">生成日時</span><strong id=\"builtAt\">—</strong></div>\n          <div class=\"build-item\"><span data-i18n=\"dependencies\">内包依存数</span><strong id=\"dependencyCount\">0</strong></div>\n        </div>\n      </details>\n    </section>";
test('existing build block is unique and the last Help scroll-body item',()=>{
 const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
 assert.doesNotMatch(main,/id="buildVersion"/);
 const help=html.match(/<dialog id="helpDialog"[^>]*>([\s\S]*?)<\/dialog>/)[1];
 const start=help.search(/<div class="dialog-body"[^>]*>/);let depth=0,end=-1;
 for(const m of help.slice(start).matchAll(/<div\b[^>]*>|<\/div>/g)){depth+=m[0].startsWith('</')?-1:1;if(depth===0){end=start+m.index;break;}}
 assert.ok(end>start);const body=help.slice(start,end);
 assert.ok(body.includes(originalBuild),'Keep the exact existing metadata block and IDs');
 assert.match(body.slice(body.indexOf(originalBuild)+originalBuild.length),/^\s*(?:<!--[^]*?-->\s*)?$/);
 for(const id of ["buildVersion", "builtAt", "dependencyCount"])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
test('only the informational footer is hidden at the existing phone breakpoint',()=>{
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const start=css.search(/@media\s*\(max-width:\s*930px\)\s*\{/);assert.ok(start>=0);
 const open=css.indexOf('{',start);let depth=1,end=open+1;for(;end<css.length&&depth;end++){if(css[end]==='{')depth++;if(css[end]==='}')depth--;}
 assert.match(css.slice(open+1,end-1),/(?:^|})\s*footer\s*\{\s*display:\s*none\s*;?\s*\}/);
});
test('keyboard disclosure clicks do not close Help; genuine backdrop clicks still do',()=>{
 const handler=html.match(/helpDialog\.addEventListener\('click',\s*event\s*=>\s*\{(.*?)\}\);/)[1];
 const dialog={closed:0,getBoundingClientRect(){return{left:20,right:300,top:20,bottom:400}},close(){this.closed++}};
 const run=new Function('helpDialog','event','closeHelp',handler);
 run(dialog,{target:{},clientX:0,clientY:0},()=>dialog.close());assert.equal(dialog.closed,0);
 run(dialog,{target:dialog,clientX:0,clientY:0},()=>dialog.close());assert.equal(dialog.closed,1);
});
