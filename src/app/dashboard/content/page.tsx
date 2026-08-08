'use client';

import { ContentStudioPage } from './ContentStudio';

export default function Page(props: {
  params?: any;
  searchParams?: any;
}) {
  return <ContentStudioPage {...props} />;
}
