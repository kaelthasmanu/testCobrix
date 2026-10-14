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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const provider_client_1 = require("../provider/provider.client");
let AuthService = class AuthService {
    provider;
    jwt;
    constructor(provider, jwt) {
        this.provider = provider;
        this.jwt = jwt;
    }
    async login(username, password) {
        const providerSession = await this.provider.login(username, password).catch((error) => {
            throw new common_1.UnauthorizedException(error instanceof Error ? error.message : 'Credenciales inválidas.');
        });
        await this.provider.saveCredentials(username, password, providerSession);
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        return {
            usuario: providerSession.usuario,
            email: providerSession.email,
            access_token: this.jwt.sign({ sub: providerSession.usuario }),
            access_token_expires_in: expiresAt.toISOString(),
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [provider_client_1.ProviderClient, jwt_1.JwtService])
], AuthService);
