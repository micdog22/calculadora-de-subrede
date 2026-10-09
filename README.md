# Calculadora de Sub-rede: IPv4, CIDR e divisão de redes (HTML + JavaScript)

Calculadora de sub-redes IPv4 para quem estuda redes, configura roteadores ou planeja o endereçamento de uma empresa. Digite `192.168.1.10/24` (ou o IP e a máscara) e veja rede, broadcast, primeiro e último host, quantidade de hosts, máscara, curinga, classe histórica e o tipo do endereço, com a visão em binário.

Também divide redes em sub-redes iguais, monta planos VLSM, confere se um IP pertence a uma rede e resume várias redes em uma só.

**Acesse online:** https://micdog22.github.io/calculadora-de-subrede/

## Recursos

- Entrada como `192.168.1.10/24`, `192.168.1.10/255.255.255.0` ou `192.168.1.10 255.255.255.0`; a máscara é validada (os bits 1 precisam ser contíguos) e, se você digitar uma máscara curinga, a ferramenta avisa qual é a máscara certa.
- Rede, broadcast, primeiro e último host, hosts utilizáveis, total de endereços, máscara, curinga e prefixo.
- Casos especiais: /31 tem 2 hosts e nenhum broadcast (RFC 3021) e /32 representa um único endereço.
- Visão binária com os bits de rede e de host destacados.
- Classe histórica (A a E) e tipo do endereço: privado (RFC 1918), CGNAT (100.64.0.0/10), loopback, link-local, multicast, documentação (RFC 5737), benchmarking (198.18.0.0/15), "esta rede" (0.0.0.0/8), reservado (240.0.0.0/4), broadcast limitado ou público.
- **Dividir em sub-redes:** em N sub-redes iguais ou por um novo prefixo.
- **VLSM:** informe as necessidades ("Vendas 100", "TI 50"...) e veja a alocação da maior para a menor, ou o aviso do que não coube.
- **Este IP pertence à rede?**, avisando quando o IP é o endereço de rede ou o de broadcast.
- **Sumarização:** a menor super-rede que cobre uma lista de redes, avisando se ela inclui endereços extras.
- Valores digitados ficam salvos no navegador.

## Como usar

| Você digita | Você recebe |
| --- | --- |
| `192.168.1.10/24` | rede 192.168.1.0/24, broadcast 192.168.1.255, hosts 192.168.1.1 a 192.168.1.254 (254 hosts) |
| `10.20.30.40 255.255.254.0` | rede 10.20.30.0/23, broadcast 10.20.31.255 (510 hosts) |
| `203.0.113.6/31` | 2 hosts (203.0.113.6 e 203.0.113.7), sem broadcast |
| VLSM em `192.168.10.0/24` com Vendas 100, TI 50, RH 20 e Link 2 | /25, /26, /27 e /30, nessa ordem |
| Sumarizar `192.168.0.0/24` a `192.168.3.0/24` | 192.168.0.0/22, resumo exato |

## Como rodar localmente

Módulos ES não carregam via `file://`, então sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000.

## Testes

```bash
npm test
```

Os testes (com `node:test`, sem dependências) cobrem os prefixos /0, /1, /8, /16, /23, /24, /30, /31 e /32, a validação de máscaras, a divisão em sub-redes, VLSM (inclusive quando não cabe), a pertinência de um IP, a sumarização, as bordas de todas as faixas especiais e entradas inválidas (octeto acima de 255, zeros à esquerda, texto qualquer).

## Como funciona

- Cada endereço é tratado como um inteiro de 32 bits sem sinal. Em JavaScript, os operadores de bits trabalham com inteiros de 32 bits com sinal, por isso todo resultado passa por `>>> 0`.
- Máscara do prefixo `p`: `(0xFFFFFFFF << (32 - p)) >>> 0` (com `p = 0` tratado à parte, porque deslocar 32 bits não muda o número em JavaScript).
- Rede = `IP & máscara`; broadcast = `rede | ~máscara`; hosts utilizáveis = 2^(32 - p) - 2, com as exceções de /31 e /32.
- No VLSM, cada necessidade vira um bloco de potência de 2 que comporta os hosts mais os endereços de rede e de broadcast (no mínimo /30). Alocando do maior para o menor, todos os blocos ficam alinhados.
- Na sumarização, o prefixo da super-rede é a quantidade de bits iniciais em comum entre o primeiro e o último endereço cobertos pela lista.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
