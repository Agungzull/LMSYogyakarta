export function apiSuccess<T>(data: T, message = 'Success') {
  return {
    success: true,
    message,
    data
  };
}

export function apiError(message: string, status = 400) {
  return {
    success: false,
    message,
    status
  };
}
