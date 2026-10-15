"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderClient = exports.ProviderError = void 0;
exports.normalizeBaseUrl = normalizeBaseUrl;
exports.parseExpiration = parseExpiration;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const database_service_1 = require("../database/database.service");
const crypto_service_1 = require("../common/crypto.service");
/** Error del administrador con un mensaje para el operador: qué pasó y cómo seguir. */
class ProviderError extends common_1.HttpException {
    kind;
    constructor(kind, message) {
        super({ statusCode: kind === 'credentials' || kind === 'not_configured' ? common_1.HttpStatus.UNPROCESSABLE_ENTITY : common_1.HttpStatus.BAD_GATEWAY, error: kind, message }, kind === 'credentials' || kind === 'not_configured' ? common_1.HttpStatus.UNPROCESSABLE_ENTITY : common_1.HttpStatus.BAD_GATEWAY);
        this.kind = kind;
    }
}
exports.ProviderError = ProviderError;
const RETRY_DELAYS_MS = [300, 1000];
const MAX_PAGES = 200;
let ProviderClient = class ProviderClient {
    database;
    crypto;
    defaultBaseUrl;
    timeoutMs;
    retryDelays;
    constructor(config, database, crypto) {
        this.database = database;
        this.crypto = crypto;
        this.defaultBaseUrl = normalizeBaseUrl(config.get('ADMIN_API_URL', 'http://127.0.0.1:4310/api/v1'));
        this.timeoutMs = Math.max(1000, Number(config.get('ADMIN_API_TIMEOUT_MS', '10000')));
        this.retryDelays = config.get('ADMIN_API_RETRIES') === '0' ? [] : RETRY_DELAYS_MS;
    }
    // ------------------------------------------------------------------ conexión
    async getSettingsView() {
        const row = await this.database.providerAuth.findUnique({ where: { id: 1 } });
        return { baseUrl: row?.baseUrl || this.defaultBaseUrl, username: row?.username ?? '', hasPassword: Boolean(row?.encryptedPassword) };
    }
    /** Completa los datos que el formulario dejó vacíos con los guardados. La contraseña vacía significa «no cambiar». */
    async resolveConnection(input) {
        const row = await this.database.providerAuth.findUnique({ where: { id: 1 } });
        const baseUrl = normalizeBaseUrl(input.baseUrl || row?.baseUrl || this.defaultBaseUrl);
        const username = input.username?.trim() || row?.username || '';
        const keepsStoredPassword = !input.password && row && (!input.username || input.username.trim() === row.username);
        const password = input.password || (keepsStoredPassword ? this.decrypt(row.encryptedPassword) : '');
        if (!username || !password)
            throw new ProviderError('not_configured', 'Falta el usuario o la contraseña del administrador. Complétalos en Configuración → Proveedor.');
        return { baseUrl, username, password };
    }
    /** «Probar conexión»: inicia sesión y cuenta los contratos, sin guardar nada. */
    async probe(connection) {
        const login = await this.login(connection);
        const ids = await this.fetchContractIds(connection.baseUrl, login.access_token);
        return { usuario: login.usuario, email: login.email, contracts: ids.length };
    }
    async saveConnection(connection, login) {
        const data = {
            baseUrl: connection.baseUrl,
            username: connection.username,
            encryptedPassword: this.crypto.encrypt(connection.password),
            accessToken: login?.access_token ?? null,
            tokenExpiresAt: login ? parseExpiration(login.access_token_expires_in).toISOString() : null,
        };
        await this.database.providerAuth.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    }
    async login(connection) {
        const response = await this.send(connection.baseUrl, '/usuario/login', { method: 'POST', body: JSON.stringify({ user_name: connection.username, password: connection.password }) });
        if (typeof response?.access_token !== 'string' || typeof response.access_token_expires_in !== 'string') {
            throw new ProviderError('invalid_response', 'El administrador respondió al inicio de sesión sin un token válido.');
        }
        parseExpiration(response.access_token_expires_in);
        return response;
    }
    // ------------------------------------------------------------------ lecturas
    async getContractIds() {
        const { baseUrl } = await this.storedConnection();
        return this.authenticated((token) => this.fetchContractIds(baseUrl, token));
    }
    async getPendingInstallments(contractId) {
        const response = await this.get(`/isp/contrato/individual?id_contrato=${contractId}`);
        // La API real devuelve la lista sin envoltorio; se acepta también `{ data: [...] }` por si cambia.
        const rows = Array.isArray(response) ? response : isRecord(response) && Array.isArray(response.data) ? response.data : null;
        if (!rows || !rows.every(isRecord))
            throw new ProviderError('invalid_response', `Las cuotas del contrato ${contractId} no vinieron como una lista.`);
        return rows;
    }
    /** Libro de cuotas del contrato hasta `until`. `success` no es fiable (viene `false` con datos): se mira `data`. */
    async getPaymentLedger(contractId, until) {
        const response = await this.get(`/isp/pago_informacion?id_contrato=${contractId}&tipo_busqueda=CUOTA&fecha_inicio=2000-01-01&fecha_fin=${until}`);
        if (!isRecord(response) || !Array.isArray(response.data) || !response.data.every(isRecord)) {
            throw new ProviderError('invalid_response', `El libro de pagos del contrato ${contractId} no trae una lista en «data».`);
        }
        return response.data;
    }
    // ------------------------------------------------------------------ internos
    async fetchContractIds(baseUrl, token) {
        const ids = new Set();
        for (let page = 1; page <= MAX_PAGES; page++) {
            // Sin `estado`: con cualquier valor la API devuelve solo los activos.
            const response = await this.send(baseUrl, `/isp/lista_ids_contratos?page=${page}`, { method: 'GET' }, token);
            if (!isRecord(response) || !Array.isArray(response.data))
                throw new ProviderError('invalid_response', 'La lista de contratos no trae «data».');
            for (const id of response.data) {
                if (!Number.isInteger(id))
                    throw new ProviderError('invalid_response', `La lista de contratos trae un id inválido («${String(id)}»).`);
                ids.add(id);
            }
            const totalPages = isRecord(response.pagination) ? Number(response.pagination.total_pages) : 1;
            if (!Number.isFinite(totalPages) || page >= totalPages || response.data.length === 0)
                break;
        }
        return [...ids];
    }
    async get(path) {
        const { baseUrl } = await this.storedConnection();
        return this.authenticated((token) => this.send(baseUrl, path, { method: 'GET' }, token));
    }
    /** Usa el token guardado; si vence o la API lo rechaza (401), inicia sesión de nuevo una vez. */
    async authenticated(operation) {
        const token = await this.ensureToken(false);
        try {
            return await operation(token);
        }
        catch (error) {
            if (!(error instanceof UnauthorizedFromProvider))
                throw error;
            return operation(await this.ensureToken(true));
        }
    }
    async storedConnection() {
        const row = await this.database.providerAuth.findUnique({ where: { id: 1 } });
        if (!row)
            throw new ProviderError('not_configured', 'Configura las credenciales del administrador en Configuración → Proveedor antes de sincronizar.');
        return { baseUrl: row.baseUrl || this.defaultBaseUrl, username: row.username, password: this.decrypt(row.encryptedPassword) };
    }
    async ensureToken(forceLogin) {
        const row = await this.database.providerAuth.findUnique({ where: { id: 1 } });
        if (!row)
            throw new ProviderError('not_configured', 'Configura las credenciales del administrador en Configuración → Proveedor antes de sincronizar.');
        if (!forceLogin && row.accessToken && row.tokenExpiresAt && Date.parse(row.tokenExpiresAt) > Date.now() + 60_000)
            return row.accessToken;
        const connection = { baseUrl: row.baseUrl || this.defaultBaseUrl, username: row.username, password: this.decrypt(row.encryptedPassword) };
        const login = await this.login(connection);
        await this.database.providerAuth.update({ where: { id: 1 }, data: { accessToken: login.access_token, tokenExpiresAt: parseExpiration(login.access_token_expires_in).toISOString() } });
        return login.access_token;
    }
    decrypt(value) {
        try {
            return this.crypto.decrypt(value);
        }
        catch {
            throw new ProviderError('not_configured', 'No se pudo descifrar la contraseña guardada (¿cambió ENCRYPTION_KEY?). Vuelve a guardarla en Configuración → Proveedor.');
        }
    }
    /** Una petición con tiempo límite y reintentos ante fallas transitorias (red, timeout, 5xx). */
    async send(baseUrl, path, init, token) {
        for (let attempt = 0;; attempt++) {
            try {
                return await this.sendOnce(baseUrl, path, init, token);
            }
            catch (error) {
                const transient = error instanceof TransientProviderError;
                if (!transient || attempt >= this.retryDelays.length)
                    throw transient ? new ProviderError('unavailable', error.message) : error;
                await new Promise((resolve) => setTimeout(resolve, this.retryDelays[attempt]));
            }
        }
    }
    async sendOnce(baseUrl, path, init, token) {
        const headers = new Headers(init.headers);
        headers.set('accept', 'application/json');
        if (init.body)
            headers.set('content-type', 'application/json');
        if (token)
            headers.set('authorization', `Bearer ${token}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        let response;
        try {
            response = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
        }
        catch (error) {
            const reason = error instanceof Error && error.name === 'AbortError' ? `no respondió en ${this.timeoutMs / 1000} s` : 'no está disponible';
            throw new TransientProviderError(`El administrador en ${baseUrl} ${reason}. Revisa la URL en Configuración o vuelve a intentar en unos minutos.`);
        }
        finally {
            clearTimeout(timeout);
        }
        const text = await response.text();
        let body;
        try {
            body = text ? JSON.parse(text) : undefined;
        }
        catch {
            body = undefined;
        }
        if (response.status === 401) {
            if (token)
                throw new UnauthorizedFromProvider();
            throw new ProviderError('credentials', `El administrador rechazó las credenciales: ${providerMessage(body)}. Corrige usuario y contraseña en Configuración.`);
        }
        if (response.status >= 500)
            throw new TransientProviderError(`El administrador falló con HTTP ${response.status}: ${providerMessage(body)}.`);
        if (!response.ok) {
            if (path.startsWith('/usuario/login'))
                throw new ProviderError('credentials', `El administrador rechazó las credenciales: ${providerMessage(body)}. Corrige usuario y contraseña en Configuración.`);
            throw new ProviderError('rejected', `El administrador rechazó la consulta ${path.split('?')[0]} (HTTP ${response.status}): ${providerMessage(body)}.`);
        }
        if (body === undefined || body === null)
            throw new ProviderError('invalid_response', `El administrador devolvió una respuesta vacía o que no es JSON en ${path.split('?')[0]}.`);
        return body;
    }
};
exports.ProviderClient = ProviderClient;
exports.ProviderClient = ProviderClient = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.ConfigService)),
    __param(1, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(2, (0, common_1.Inject)(crypto_service_1.CryptoService)),
    __metadata("design:paramtypes", [config_1.ConfigService, database_service_1.DatabaseService, crypto_service_1.CryptoService])
], ProviderClient);
class TransientProviderError extends Error {
}
class UnauthorizedFromProvider extends common_1.BadGatewayException {
    constructor() {
        super('El administrador rechazó el token.');
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Los errores del administrador vienen como `{ detail: { mensaje } }`, `{ detail: "..." }` o una lista. */
function providerMessage(body) {
    if (isRecord(body)) {
        const detail = body.detail;
        if (isRecord(detail) && typeof detail.mensaje === 'string')
            return detail.mensaje;
        if (typeof detail === 'string')
            return detail;
        if (typeof body.message === 'string')
            return body.message;
    }
    if (Array.isArray(body) && isRecord(body[0]) && typeof body[0].message === 'string')
        return String(body[0].message);
    return 'sin detalle';
}
function normalizeBaseUrl(value) {
    return value.trim().replace(/\/+$/, '');
}
/** `access_token_expires_in` viene en UTC sin zona. */
function parseExpiration(value) {
    const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now())
        throw new ProviderError('invalid_response', 'El administrador devolvió un token ya vencido o con una fecha inválida.');
    return date;
}
