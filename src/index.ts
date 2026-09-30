import joplin from 'api';
const CHEIO = String.fromCharCode(9608);
const MEIO = String.fromCharCode(9612);
const VAZIO = String.fromCharCode(9617);
const ABRE = String.fromCharCode(91);
const FECHA = String.fromCharCode(93);
function ehDigito(c: string): boolean {
return c >= '0' && c <= '9';
}
function gerarBarra(nota: number): string {
const max = 5;
let n = nota;
if (n < 0) n = 0;
if (n > max) n = max;
const totalMeios = Math.round(n * 2);
const cheios = Math.floor(totalMeios / 2);
const meia = totalMeios % 2 === 1;
const vazios = max - cheios - (meia ? 1 : 0);
let barra = '';
for (let i = 0; i < cheios; i++) barra += CHEIO;
if (meia) barra += MEIO;
for (let i = 0; i < vazios; i++) barra += VAZIO;
return barra;
}
function processarNota(body: string): string {
const alvo = 'nota';
const lower = body.toLowerCase();
let resultado = '';
let i = 0;
while (i < body.length) {
const pos = lower.indexOf(alvo, i);
if (pos < 0) {
resultado += body.slice(i);
break;
}
resultado += body.slice(i, pos);
let j = pos + alvo.length;
while (j < body.length && body.charAt(j) === ' ') j++;
let numStr = '';
while (j < body.length && (ehDigito(body.charAt(j)) || body.charAt(j) === '.' || body.charAt(j) === ',')) {
numStr += body.charAt(j);
j++;
}
if (numStr.length === 0) {
resultado += alvo;
i = pos + alvo.length;
continue;
}
const nota = parseFloat(numStr.replace(',', '.'));
let k = j;
while (k < body.length && body.charAt(k) === ' ') k++;
if (k < body.length && body.charAt(k) === ABRE) {
const fecha = body.indexOf(FECHA, k);
if (fecha >= 0) {
let m = fecha + 1;
while (m < body.length && body.charAt(m) === ' ') m++;
let num2 = '';
while (m < body.length && (ehDigito(body.charAt(m)) || body.charAt(m) === '.' || body.charAt(m) === ',')) {
num2 += body.charAt(m);
m++;
}
if (num2.length > 0 && m < body.length && body.charAt(m) === '/') {
let m2 = m + 1;
while (m2 < body.length && ehDigito(body.charAt(m2))) m2++;
k = m2;
} else {
k = fecha + 1;
}
}
}
resultado += 'nota ' + nota.toFixed(1) + ' ' + ABRE + gerarBarra(nota) + FECHA + ' ' + nota.toFixed(1) + '/5';
i = k;
}
return resultado;
}
joplin.plugins.register({
onStart: async function () {
await joplin.workspace.onNoteChange(async (event: any) => {
const note = event && event.item ? event.item : null;
if (!note || typeof note.body !== 'string' || !note.id) return;
const novo = processarNota(note.body);
if (novo !== note.body) {
await joplin.data.put(['notes', note.id], null, { body: novo });
}
});
},
});