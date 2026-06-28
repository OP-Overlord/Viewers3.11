import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reduceRenderSize } from './renderedImageLoader';

interface Props {
  children: ReactNode;
  viewportId: string;
}

interface State {
  hasError: boolean;
  retryCount: number;
}

const MAX_RETRIES = 15;
const RETRY_DELAY = 300;

/**
 * ErrorBoundary para el viewport mobile.
 * Captura errores transitorios (como ViewportOrientationMarkers accediendo a datos no listos)
 * y reintenta el renderizado despues de un breve delay.
 */
class ViewportErrorBoundary extends Component<Props, State> {
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    // Si el error parece un fallo de render WebGL/vtk (textura demasiado grande para
    // la GPU), reducir el tamaño de render del viewport para que el remontaje (retry)
    // use una textura menor. Gated por la firma y capado para no degradar la calidad
    // ante errores transitorios no relacionados.
    if (
      this.state.retryCount < 3 &&
      /isAttributeUsed|setMapperShaderParameters|webgl|context lost/i.test(error?.message ?? '')
    ) {
      reduceRenderSize(this.props.viewportId);
    }
    // Solo loguear en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[MobileViewport] Error transitorio en viewport ${this.props.viewportId}:`,
        error.message
      );
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    // Reset si el viewportId cambia
    if (prevProps.viewportId !== this.props.viewportId) {
      this.setState({ hasError: false, retryCount: 0 });
      return;
    }

    // Si hay error y no hemos excedido los reintentos, programar retry
    if (this.state.hasError && this.state.retryCount < MAX_RETRIES && !this.retryTimeout) {
      this.retryTimeout = setTimeout(() => {
        this.retryTimeout = null;
        this.setState(prev => ({
          hasError: false,
          retryCount: prev.retryCount + 1,
        }));
      }, RETRY_DELAY);
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      // Mostrar loading mientras reintentamos
      if (this.state.retryCount < MAX_RETRIES) {
        return (
          <div className="flex h-full w-full items-center justify-center bg-black">
            <div className="text-muted-foreground text-sm">Cargando...</div>
          </div>
        );
      }

      // Si excedimos los reintentos, mostrar mensaje de error
      return (
        <div className="flex h-full w-full items-center justify-center bg-black">
          <div className="text-destructive text-sm">Error al cargar el viewport</div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ViewportErrorBoundary;
