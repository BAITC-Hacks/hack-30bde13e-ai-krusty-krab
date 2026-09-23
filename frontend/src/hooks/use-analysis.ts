import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analysisApi } from '@/api/analysis'

export function useAnalyses() {
  return useQuery({ queryKey: ['analyses'], queryFn: analysisApi.list })
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
