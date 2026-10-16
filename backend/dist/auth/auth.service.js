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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const provider_client_1 = require("../provider/provider.client");
/**
 * El panel no tiene usuarios propios: se entra con las credenciales del administrador de facturas.
 * Al entrar quedan guardadas (cifradas) para que las corridas, también la automática, puedan renovar el token.
 */
let AuthService = class AuthService {
    provider;
    jwt;
    constructor(provider, jwt) {
        this.provider = provider;
        this.jwt = jwt;
    }
    async login(username, password) {
        const connection = await this.provider.resolveConnection({ username, password });
        const providerSession = await this.provider.login(connection);
        await this.provider.saveConnection(connection, providerSession);
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
        return {
            usuario: providerSession.usuario,
            email: providerSession.email,
            access_token: this.jwt.sign({ sub: providerSession.usuario }, { expiresIn: '8h' }),
            access_token_expires_in: expiresAt.toISOString(),
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(provider_client_1.ProviderClient)),
    __param(1, (0, common_1.Inject)(jwt_1.JwtService)),
    __metadata("design:paramtypes", [provider_client_1.ProviderClient, jwt_1.JwtService])
], AuthService);
