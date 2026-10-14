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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const database_service_1 = require("../database/database.service");
const crypto_service_1 = require("../common/crypto.service");
let ProviderClient = class ProviderClient {
    database;
    crypto;
    baseUrl;
    constructor(config, database, crypto) {
        this.database = database;
        this.crypto = crypto;
        this.baseUrl = config.get('ADMIN_API_URL', 'http://127.0.0.1:4310/api/v1').replace(/\/+$/, '');
    }
    async login(username, password) {
        return this.request('/usuario/login', {
            method: 'POST',
            body: JSON.stringify({ user_name: username, password }),
        }, false);
    }
    async getContractIds() {
        const response = await this.request('/isp/lista_ids_contratos', { method: 'GET' });
        return response.data ?? [];
    }
    async getPendingInstallments(contractId) {
        return this.request(`/isp/contrato/individual?id_contrato=${contractId}`, { method: 'GET' });
    }
    async getPayments(contractId) {
        const response = await this.request(`/isp/pago_informacion?id_contrato=${contractId}&tipo_busqueda=CUOTA&fecha_inicio=2020-01-01&fecha_fin=2099-12-31`, { method: 'GET' });
        return response.data ?? [];
    }
    async saveCredentials(username, password, login) {
        await this.database.providerAuth.upsert({
            where: { id: 1 },
            create: { id: 1, username, encryptedPassword: this.crypto.encrypt(password), accessToken: login.access_token, tokenExpiresAt: this.parseExpiration(login.access_token_expires_in).toISOString() },
            update: { username, encryptedPassword: this.crypto.encrypt(password), accessToken: login.access_token, tokenExpiresAt: this.parseExpiration(login.access_token_expires_in).toISOString() },
        });
    }
    async getProviderIdentity() {
        const row = await this.database.providerAuth.findUnique({ where: { id: 1 } });
        return row ? { usuario: row.username, email: '', expiresAt: row.tokenExpiresAt ?? '' } : null;
    }
    async ensureToken() {
        const row = await this.database.providerAuth.findUnique({ where: { id: 1 } });
        if (!row)
            throw new common_1.UnauthorizedException('Configura las credenciales del administrador antes de sincronizar.');
        if (row.accessToken && row.tokenExpiresAt && Date.parse(row.tokenExpiresAt) > Date.now() + 30_000)
            return row.accessToken;
        const password = this.crypto.decrypt(row.encryptedPassword);
        const login = await this.login(row.username, password);
        await this.saveCredentials(row.username, password, login);
        return login.access_token;
    }
    parseExpiration(value) {
        const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now())
            throw new common_1.UnauthorizedException('El administrador devolvió una sesión inválida o expirada.');
        return date;
    }
    async request(path, init, authenticated = true) {
        const headers = new Headers(init.headers);
        headers.set('accept', 'application/json');
        if (init.body)
            headers.set('content-type', 'application/json');
        if (authenticated)
            headers.set('authorization', `Bearer ${await this.ensureToken()}`);
        let response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
        }
        catch (error) {
            throw new common_1.ServiceUnavailableException('No se pudo conectar con el administrador.', { cause: error });
        }
        const body = await response.json().catch(() => undefined);
        if (!response.ok) {
            const detail = typeof body === 'object' && body !== null && 'detail' in body ? String(body.detail) : `HTTP ${response.status}`;
            throw new common_1.ServiceUnavailableException(`El administrador rechazó la solicitud: ${detail}`);
        }
        return body;
    }
};
exports.ProviderClient = ProviderClient;
exports.ProviderClient = ProviderClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        database_service_1.DatabaseService,
        crypto_service_1.CryptoService])
], ProviderClient);
