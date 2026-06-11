export interface ApiError {
  detail: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
