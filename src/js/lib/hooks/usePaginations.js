import { useState, useCallback, useEffect } from 'react'

/**
 * Hook reutilizável para paginação do tipo "Load More"
 *
 * ⭐ COMO FUNCIONA A MATEMÁTICA:
 *   page 0 → from = 0 * 10 = 0,  to = 0 + 10 - 1 = 9   (itens 0 a 9)
 *   page 1 → from = 1 * 10 = 10, to = 10 + 10 - 1 = 19  (itens 10 a 19)
 *   page 2 → from = 2 * 10 = 20, to = 20 + 10 - 1 = 29  (itens 20 a 29)
 *
 * ⭐ POR QUE A fetchFn RECEBE (from, to) E NÃO OS FILTROS?
 *   O hook não precisa saber NADA sobre serviços, eventos ou qualquer entidade.
 *   A página que usa o hook cria uma função "fechada" (closure) que já carrega
 *   os filtros dentro dela — e passa só (from, to) para o hook calcular.
 *   Isso é o que torna o hook 100% reutilizável em qualquer página.
 *
 *   Exemplo de uso em services.js:
 *
 *     const fetchFn = useCallback((from, to) => {
 *       return fetchServices(currentFilters, currentOrders, { from, to })
 *     }, [currentFilters, currentOrders])   // ← recria só quando filtros mudam
 *
 *     const { items, total, loading, hasMore, loadMore, reset } =
 *       usePagination(fetchFn, { pageSize: 10 })
 *
 * @param {Function} fetchFn   - Recebe (from, to) e retorna { data, count, error }
 * @param {Object}   options
 * @param {number}   options.pageSize - Quantos itens carregar por vez (padrão: 10)
 */
export function usePagination(fetchFn, { pageSize = 5 } = {}) {

    // Todos os items carregados ATÉ AGORA (vai crescendo a cada load)
    const [items, setItems] = useState([])

    // Total de registros que existem no banco (vem do Supabase count)
    const [total, setTotal] = useState(0)

    // Qual "página" vamos carregar a seguir (começa em 0)
    // page 0 = primeira carga, page 1 = segunda carga, etc.
    const [page, setPage] = useState(0)

    // Está carregando agora? (para mostrar spinner / desabilitar botão)
    const [loading, setLoading] = useState(false)

    // Ainda tem mais items para carregar?
    // items.length < total → true quando há mais no banco do que na tela
    const hasMore = items.length < total

    // ─────────────────────────────────────────────────────────
    // loadMore: busca o próximo bloco de itens e ACUMULA na lista
    // ─────────────────────────────────────────────────────────
    const loadMore = useCallback(async () => {
        // Proteção dupla:
        // - loading: não dispara outra chamada se já está buscando
        // - !hasMore && total > 0: não busca se já carregou tudo
        //   (total > 0 evita bloquear a primeira carga quando total ainda é 0)
        if (loading) return
        if (!hasMore && total > 0) return

        setLoading(true)

        // Calcula os índices para o Supabase .range(from, to)
        const from = page * pageSize
        const to = from + pageSize - 1

        try {
            const { data, count, error } = await fetchFn(from, to)

            if (error) throw error

            if (data) {
                // [...prev, ...data] → acumula: NÃO substitui a lista, ADICIONA no final
                setItems(prev => [...prev, ...data])

                // Salva o total que veio do Supabase para calcular hasMore
                setTotal(count ?? 0)

                // Avança para a próxima página (próximo loadMore vai buscar o bloco seguinte)
                setPage(prev => prev + 1)
            }
        } catch (err) {
            // Re-lança o erro para a página tratar e exibir mensagem ao usuário
            console.error('[usePagination] Erro ao buscar dados:', err)
            throw err
        } finally {
            // finally garante que loading volta para false mesmo se der erro
            setLoading(false)
        }

    }, [fetchFn, page, pageSize, loading, hasMore, total])

    // ─────────────────────────────────────────────────────────
    // Carrega automaticamente na primeira montagem do componente
    // ─────────────────────────────────────────────────────────
    useEffect(() => {
        loadMore()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // array vazio = roda só uma vez, na montagem

    // ─────────────────────────────────────────────────────────
    // reset: volta tudo ao estado inicial
    // Chame isso quando filtros ou ordenação mudarem
    // ─────────────────────────────────────────────────────────
    const reset = useCallback(() => {
        setItems([])
        setTotal(0)
        setPage(0)
    }, [])

    return {
        items,    // Array com TODOS os items carregados até agora
        total,    // Número total no banco — use para o contador "X de Y"
        loading,  // Boolean — use para mostrar spinner / desabilitar botão
        hasMore,  // Boolean — use para mostrar/esconder o botão Load More
        loadMore, // Função — chame no clique do botão Load More
        reset,    // Função — chame quando filtros mudarem
    }
}