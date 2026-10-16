import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	constructor(config: ConfigService) {
		const databaseUrl = config.get<string>('DATABASE_URL', 'file:./data/cobrix.sqlite')
		if (databaseUrl.startsWith('file:')) {
			const filename = databaseUrl.slice('file:'.length)
			const databasePath = isAbsolute(filename) ? filename : resolve(process.cwd(), 'prisma', filename)
			mkdirSync(dirname(databasePath), { recursive: true })
		}
		super()
	}

	async onModuleInit(): Promise<void> {
		await this.$connect()
	}

	async onModuleDestroy(): Promise<void> {
		await this.$disconnect()
	}
}
