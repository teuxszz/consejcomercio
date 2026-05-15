import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Error Boundary global — captura erros de render em qualquer componente e
// evita a tela branca. Sem isso, um único bug (ex.: leitura de null) derruba
// o app inteiro.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log para o console — útil enquanto não há serviço de telemetria.
    console.error('[ErrorBoundary] erro de render capturado:', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#00081d',
          color: 'rgba(220,230,240,0.90)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.30)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 28,
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Algo deu errado
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(150,165,180,0.80)', lineHeight: 1.6, marginBottom: 20 }}>
            A tela encontrou um erro inesperado e não pôde ser exibida. Recarregue
            a página — se o problema persistir, avise a equipe de desenvolvimento.
          </p>
          <pre
            style={{
              fontSize: 11,
              textAlign: 'left',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 20,
              overflowX: 'auto',
              color: 'rgba(252,165,165,0.85)',
            }}
          >
            {error.name}: {error.message}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#0089ac',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recarregar página
          </button>
        </div>
      </div>
    )
  }
}
