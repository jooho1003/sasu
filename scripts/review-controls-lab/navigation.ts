const router = { push: (url: string) => { window.location.href = url; } };
export const useRouter = () => router;
