import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  throw redirect(
    302,
    `/me/daily/${encodeURIComponent(params.topic ?? '')}/${encodeURIComponent(params.date ?? '')}`,
  );
};
