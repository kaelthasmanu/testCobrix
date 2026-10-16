import { ButtonLink, Card, EmptyState } from './ui'

/** Primer uso: sin proveedor no hay nada que sincronizar. */
export function ProviderMissing() {
	return (
		<Card>
			<EmptyState action={<ButtonLink primary to="/configuracion">Configurar proveedor</ButtonLink>} title="Conecta el administrador de facturas">
				Cobrix todavía no sabe con qué API hablar. En Configuración → Proveedor pon la URL, el usuario y la contraseña, y usa «Probar conexión». En la prueba: <span className="mono">cobrix</span> / <span className="mono">cobrix-sandbox</span>.
			</EmptyState>
		</Card>
	)
}
