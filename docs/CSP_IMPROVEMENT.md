# Mejora de Content Security Policy (CSP)

## Problema Actual

El sistema actual usa `unsafe-inline` en el CSP:

```javascript
scriptSrc: ["'self'", "'unsafe-inline'"],
styleSrc: ["'self'", "'unsafe-inline'"]
```

Esto permite scripts y estilos inline, lo cual es un riesgo de seguridad ante ataques XSS.

## Solución: Usar Nonces

Un **nonce** es un número aleatorio que se genera en cada request y se usa para autorizar scripts/estilos específicos.

### Implementación

#### 1. Backend: Generar Nonce

Ya está implementado en `backend/src/server.js`:

```javascript
// Middleware para generar nonce por request
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// CSP con nonce
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'` // Scripts autorizados
      ],
      styleSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'` // Estilos autorizados
      ],
      // ... resto igual
    }
  }
}));
```

#### 2. Frontend: Remover Scripts Inline

**Actualmente** (con unsafe-inline):
```html
<script>
  // Código inline aquí
</script>
```

**Debe cambiar a** (con nonce):
```html
<script nonce="<%= nonce %>">
  // Código inline aquí
</script>
```

O mejor aún, **mover todo a archivos externos**:
```html
<!-- Reemplazar scripts inline con archivos externos -->
<script src="app.js"></script>
```

### Estado Actual

✅ CSP configurado con `unsafe-inline` (funcional pero menos seguro)
⏳ Pendiente: Refactorizar frontend para remover inline scripts
⏳ Pendiente: Implementar nonces dinámicos

### Opciones

**Opción 1: Mantener `unsafe-inline` (actual)**
- ✅ Funciona sin cambios
- ❌ Menos seguro ante XSS

**Opción 2: Usar Nonces**
- ✅ Máxima seguridad
- ❌ Requiere refactorizar HTML
- ❌ Requiere templating en servidor (EJS/Pug)

**Opción 3: Remover inline completamente**
- ✅ Muy seguro
- ✅ No requiere nonces
- ❌ Requiere refactorizar frontend (ya está casi completo en app.js)

## Recomendación

**Para tu caso**: **Opción 3** es la mejor

- Todo tu JavaScript ya está en `app.js`
- Solo necesitás asegurar que no hay scripts inline en los HTML
- No requiere templating en servidor

### Checklist de Implementación

1. [ ] Verificar que no hay `<script>` inline en:
   - [ ] `index.html`
   - [ ] `egreso.html`
   - [ ] `consulta-egresos.html`
   - [ ] `usuarios.html`
   - [ ] `logs.html`

2. [ ] Verificar que no hay `<style>` inline
   - Todo CSS debe estar en `styles.css`

3. [ ] Actualizar CSP en `server.js`:
   ```javascript
   scriptSrc: ["'self'"], // Remover unsafe-inline
   styleSrc: ["'self'"]   // Remover unsafe-inline
   ```

4. [ ] Testear en navegador:
   - Abrir DevTools > Console
   - Verificar que no hay errores CSP
   - Verificar que todo funciona correctamente

## Beneficios

✅ Bloquea XSS por inyección de scripts
✅ Cumple con mejores prácticas de seguridad web
✅ Mejora score de seguridad en auditorías
✅ Compatible con políticas corporativas estrictas

## Referencia

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Google: CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [OWASP: Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
