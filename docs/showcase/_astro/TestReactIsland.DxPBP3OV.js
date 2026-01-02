import{r as m}from"./index.WFquGv8Z.js";var l={exports:{}},s={};/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var x;function p(){if(x)return s;x=1;var n=Symbol.for("react.transitional.element"),o=Symbol.for("react.fragment");function i(c,t,e){var a=null;if(e!==void 0&&(a=""+e),t.key!==void 0&&(a=""+t.key),"key"in t){e={};for(var u in t)u!=="key"&&(e[u]=t[u])}else e=t;return t=e.ref,{$$typeof:n,type:c,key:a,ref:t!==void 0?t:null,props:e}}return s.Fragment=o,s.jsx=i,s.jsxs=i,s}var d;function R(){return d||(d=1,l.exports=p()),l.exports}var r=R();function v(){const[n,o]=m.useState(0);return r.jsxs("div",{className:"bg-white rounded-lg shadow-md p-6 max-w-sm",children:[r.jsx("h2",{className:"text-xl font-semibold text-gray-800 mb-4",children:"React Island Test"}),r.jsx("p",{className:"text-gray-600 mb-4",children:"Click the button to verify React hydration is working."}),r.jsxs("div",{className:"flex items-center gap-4",children:[r.jsxs("button",{onClick:()=>o(i=>i+1),className:"bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors",children:["Count: ",n]}),n>0&&r.jsx("span",{className:"text-green-600 font-medium",children:"Hydration works!"})]})]})}export{v as default};
