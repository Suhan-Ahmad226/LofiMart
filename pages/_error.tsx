import ErrorPage from 'next/error';
import type { NextPageContext } from 'next';

type ErrorProps = {
  statusCode: number;
};

function CustomError({ statusCode }: ErrorProps) {
  return <ErrorPage statusCode={statusCode} />;
}

CustomError.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default CustomError;
