// @ts-nocheck
import joplin from 'api';

const CHEIO = String.fromCharCode(9608);
const MEIO = String.fromCharCode(9612);
const VAZIO = String.fromCharCode(9617);
const ABRE = String.fromCharCode(91);
const FECHA = String.fromCharCode(93);
const LOG_ARQUIVO = '/tmp/barra-plugin.log';

let intervalo: any = 0;
let processando = false;
let ticks = 0;
let ultimoErro = '';
let errosIguais = 0;

function escreverLog(mensagem: string, dado?: any): void {
	let linha = new Date().toISOString() + ' [barra] ' + mensagem;

	if (dado !== undefined) {
		try {
			linha += ' ' + JSON.stringify(dado);
		} catch (e) {
			linha += ' [dado_nao_serializavel]';
		}
	}

	linha += '\n';

	try {
		const fs = require('fs');
		fs.appendFileSync(LOG_ARQUIVO, linha);
	} catch (e) {
		console.log('[barra] ' + mensagem, dado);
	}
}

function registrarErro(rotulo: string, erro: any): void {
	let mensagem = rotulo + ' ' + String(erro);

	if (mensagem === ultimoErro) {
		errosIguais += 1;

		if ((errosIguais % 30) !== 0) {
			return;
		}

		mensagem = mensagem + ' repetido ' + String(errosIguais);
	} else {
		ultimoErro = mensagem;
		errosIguais = 1;
	}

	escreverLog(mensagem);
}

function ehDigito(c: string): boolean {
	return c >= '0' && c <= '9';
}

function ehLetraOuDigito(c: string): boolean {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}

function limiteAnterior(texto: string, pos: number): boolean {
	if (pos <= 0) return true;
	return !ehLetraOuDigito(texto.charAt(pos - 1));
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

		if (!limiteAnterior(lower, pos)) {
			resultado += body.slice(i, pos + alvo.length);
			i = pos + alvo.length;
			continue;
		}

		resultado += body.slice(i, pos);

		let j = pos + alvo.length;

		while (j < body.length && (body.charAt(j) === ' ' || body.charAt(j) === ':')) {
			j++;
		}

		const fimGatilho = j;
		let numStr = '';

		while (j < body.length && (ehDigito(body.charAt(j)) || body.charAt(j) === '.' || body.charAt(j) === ',')) {
			numStr += body.charAt(j);
			j++;
		}

		if (numStr.length === 0) {
			resultado += body.slice(pos, pos + alvo.length);
			i = pos + alvo.length;
			continue;
		}

		const notaBruta = parseFloat(numStr.replace(',', '.'));

		if (isNaN(notaBruta) || notaBruta < 0 || notaBruta > 5) {
			resultado += body.slice(pos, j);
			i = j;
			continue;
		}

		const gatilho = body.slice(pos, fimGatilho);
		const nota = Math.max(0, Math.min(5, notaBruta));
		const ultimo = gatilho.length > 0 ? gatilho.charAt(gatilho.length - 1) : '';
		const precisaEspaco = ultimo !== ' ';

		let k = j;

		while (k < body.length && body.charAt(k) === ' ') {
			k++;
		}

		if (k < body.length && body.charAt(k) === '/') {
			let p = k + 1;
			let den = '';

			while (p < body.length && ehDigito(body.charAt(p))) {
				den += body.charAt(p);
				p++;
			}

			if (den.length > 0) {
				k = p;

				while (k < body.length && body.charAt(k) === ' ') {
					k++;
				}
			}
		}

		if (k < body.length && body.charAt(k) === ABRE) {
			const fecha = body.indexOf(FECHA, k);

			if (fecha >= 0) {
				let m = fecha + 1;

				while (m < body.length && body.charAt(m) === ' ') {
					m++;
				}

				let num2 = '';

				while (m < body.length && (ehDigito(body.charAt(m)) || body.charAt(m) === '.' || body.charAt(m) === ',')) {
					num2 += body.charAt(m);
					m++;
				}

				if (num2.length > 0) {
					while (m < body.length && body.charAt(m) === ' ') {
						m++;
					}

					if (m < body.length && body.charAt(m) === '/') {
						let p2 = m + 1;
						let den2 = '';

						while (p2 < body.length && ehDigito(body.charAt(p2))) {
							den2 += body.charAt(p2);
							p2++;
						}

						if (den2.length > 0) {
							m = p2;
						}
					}

					k = m;
				} else {
					k = fecha + 1;
				}
			}
		}

		resultado += gatilho + (precisaEspaco ? ' ' : '') + nota.toFixed(1) + ' ' + ABRE + gerarBarra(nota) + FECHA + ' ' + nota.toFixed(1) + '/5';
		i = k;
	}

	return resultado;
}

function extrairLista(res: any): any[] {
	if (Array.isArray(res)) return res;
	if (res && Array.isArray(res.items)) return res.items;
	if (res && Array.isArray(res.notes)) return res.notes;
	if (res && res.data && Array.isArray(res.data)) return res.data;
	return [];
}

async function obterListaNotas(): Promise<any[]> {
	const tentativas: any[] = [
		{ fields: ['id', 'body', 'updated_time'] },
		{ fields: ['id', 'body'] },
		null
	];

	for (let i = 0; i < tentativas.length; i++) {
		try {
			const opcao = tentativas[i];
			const res = opcao
				? await (joplin.data as any).get(['notes'], opcao)
				: await (joplin.data as any).get(['notes']);
			const lista = extrairLista(res);

			if (lista.length > 0) {
				return lista;
			}
		} catch (e) {
			registrarErro('erro ao listar notas', e);
		}
	}

	return [];
}

function notaRecente(nota: any): boolean {
	const agora = Date.now();
	const atualizado = Number(nota.updated_time);

	if (!atualizado || isNaN(atualizado)) {
		return false;
	}

	return (agora - atualizado) < 1500;
}

async function processarTudo(): Promise<void> {
	if (processando) return;
	processando = true;

	try {
		ticks += 1;
		const notas = await obterListaNotas();

		if (ticks === 1 || (ticks % 30) === 0) {
			escreverLog('polling ativo', notas.length);
		}

		for (let i = 0; i < notas.length; i++) {
			const nota = notas[i];

			if (!nota || !nota.id || typeof nota.body !== 'string') {
				continue;
			}

			if (notaRecente(nota)) {
				continue;
			}

			const novo = processarNota(nota.body);

			if (novo !== nota.body) {
				try {
					await (joplin.data as any).put(['notes', String(nota.id)], null, { body: novo });
					escreverLog('nota atualizada', String(nota.id));
					break;
				} catch (e) {
					registrarErro('erro ao salvar nota', e);
					break;
				}
			}
		}
	} catch (e) {
		registrarErro('erro no polling', e);
	} finally {
		processando = false;
	}
}

joplin.plugins.register({
	onStart: async function () {
		escreverLog('LOADED v8 polling global');

		try {
			await processarTudo();
			intervalo = setInterval(async () => {
				await processarTudo();
			}, 2000);
			escreverLog('polling global iniciado');
		} catch (e) {
			registrarErro('erro ao iniciar polling', e);
		}
	},
});
