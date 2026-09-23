import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analysisApi } from '@/api/analysis'

export function useAnalyses() {
  return useQuery({ queryKey: ['analyses'], queryFn: analysisApi.list,
    refetchInterval: query => query.state.data?.some(row => ['queued', 'processing'].includes(row.status)) ? 3000 : false })
}

export function useAnalysis(id: string) {
  return useQuery({
    queryKey: ['analysis', id],
    queryFn: () => analysisApi.get(id),
    refetchInterval: (query) => ['queued', 'processing'].includes(query.state.data?.status ?? '') ? 1500 : false,
  })
}

export function useCreateAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: analysisApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analyses'] }),
  })
}

export function useRetryAnalysis(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => analysisApi.retry(id),
    onSuccess: analysis => {
      queryClient.setQueryData(['analysis', id], analysis)
      void queryClient.invalidateQueries({ queryKey: ['analyses'] })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['analysis', id] }),
  })
}
