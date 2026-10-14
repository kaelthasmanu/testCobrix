import { Module } from '@nestjs/common'
import { ProviderClient } from './provider.client'

@Module({
	providers: [ProviderClient],
	exports: [ProviderClient],
})
export class ProviderModule {}
