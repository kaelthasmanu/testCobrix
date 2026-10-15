import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

@Injectable()
export class CryptoService {
	private readonly key: Buffer

	constructor(@Inject(ConfigService) config: ConfigService) {
		this.key = createHash('sha256').update(config.get<string>('ENCRYPTION_KEY', 'development-only-key')).digest()
	}

	encrypt(value: string): string {
		const iv = randomBytes(12)
		const cipher = createCipheriv('aes-256-gcm', this.key, iv)
		const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
		return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
	}

	decrypt(value: string): string {
		const [ivValue, tagValue, encryptedValue] = value.split('.')
		const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'))
		decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
		return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
	}
}
