/*
 * Kairós · Acceso a GitHub con el token personal del formulador.
 * Los datos de cada organización viven en un repositorio privado "kairos-datos-<org>".
 */
(function (global) {
  'use strict';

  var API = 'https://api.github.com';
  var PREFIJO_REPO = 'kairos-datos-';

  function ErrorGitHub(mensaje, estado) {
    var e = new Error(mensaje);
    e.estado = estado;
    return e;
  }

  function crear(token) {
    function pedir(ruta, opciones) {
      opciones = opciones || {};
      // Solo las cabeceras imprescindibles: cada cabecera extra obliga al navegador
      // a pedir permiso (CORS) y algunas redes o versiones lo rechazan.
      var cabeceras = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token };
      if (opciones.body) cabeceras['Content-Type'] = 'application/json';
      var peticion;
      try {
        peticion = fetch(API + ruta, {
          method: opciones.method || 'GET',
          headers: cabeceras,
          body: opciones.body ? JSON.stringify(opciones.body) : undefined
        });
      } catch (e) {
        return Promise.reject(ErrorGitHub('token-invalido', -1));
      }
      return peticion.catch(function (e) {
        // Error de red o de CORS: la petición no llegó a GitHub.
        throw ErrorGitHub(e && e.message ? e.message : 'red', 0);
      }).then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return null; }).then(function (cuerpo) {
          if (!r.ok) {
            var detalle = cuerpo && cuerpo.message ? cuerpo.message : 'HTTP ' + r.status;
            throw ErrorGitHub(detalle, r.status);
          }
          return cuerpo;
        });
      });
    }

    function rutaContenido(repo, ruta) {
      return '/repos/' + repo + '/contents/' + ruta.split('/').map(encodeURIComponent).join('/');
    }

    return {
      usuario: function () { return pedir('/user'); },

      reposKairos: function () {
        return pedir('/user/repos?per_page=100&sort=updated').then(function (repos) {
          return (repos || []).filter(function (r) {
            return r.name.toLowerCase().indexOf(PREFIJO_REPO) === 0;
          }).map(function (r) {
            return { nombre: r.full_name, privado: r.private, escritura: !!(r.permissions && r.permissions.push) };
          });
        });
      },

      repo: function (nombre) {
        return pedir('/repos/' + nombre).then(function (r) {
          return { nombre: r.full_name, privado: r.private, escritura: !!(r.permissions && r.permissions.push) };
        });
      },

      // Devuelve { sha, texto } o null si el archivo no existe.
      leerTexto: function (repo, ruta) {
        return pedir(rutaContenido(repo, ruta)).then(function (r) {
          return { sha: r.sha, texto: base64ATexto(r.content) };
        }, function (e) {
          if (e.estado === 404) return null;
          throw e;
        });
      },

      // Crea o reemplaza un archivo. contenidoBase64 ya viene codificado.
      escribir: function (repo, ruta, contenidoBase64, mensaje) {
        return pedir(rutaContenido(repo, ruta)).then(function (r) { return r.sha; }, function (e) {
          if (e.estado === 404) return undefined;
          throw e;
        }).then(function (sha) {
          return pedir(rutaContenido(repo, ruta), {
            method: 'PUT',
            body: { message: mensaje, content: contenidoBase64, sha: sha }
          });
        });
      }
    };
  }

  function bytesABase64(bytes) {
    var binario = '';
    var trozo = 0x8000;
    for (var i = 0; i < bytes.length; i += trozo) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + trozo));
    }
    return btoa(binario);
  }

  function textoABase64(texto) {
    return bytesABase64(new TextEncoder().encode(texto));
  }

  function base64ATexto(b64) {
    var binario = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(binario.length);
    for (var i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Comprueba si este navegador puede llegar a GitHub sin token (petición simple, sin CORS previo).
  function hayConexion() {
    return fetch(API + '/zen').then(function (r) { return r.ok || r.status === 403; }, function () { return false; });
  }

  // Quita espacios, saltos de línea y caracteres invisibles que se cuelan al copiar el token.
  function limpiarToken(t) {
    return String(t || '').replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '');
  }

  function tokenValido(t) {
    return /^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(t);
  }

  global.KairosGitHub = {
    crear: crear,
    hayConexion: hayConexion,
    limpiarToken: limpiarToken,
    tokenValido: tokenValido,
    PREFIJO_REPO: PREFIJO_REPO,
    bytesABase64: bytesABase64,
    textoABase64: textoABase64
  };
})(this);
