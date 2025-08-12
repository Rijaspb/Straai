import { Request, Response, NextFunction } from 'express'

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not Found - ${req.originalUrl}`)
  res.status(404)
  next(error)
}

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode

  const isProd = process.env.NODE_ENV === 'production'
  res.status(statusCode).json({
    message: isProd ? 'Internal Server Error' : error.message,
    stack: isProd ? '🥞' : error.stack,
  })
}
