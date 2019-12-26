import {
  CanActivate,
  ExecutionContext,
  Logger,
  mixin,
  Optional,
  UnauthorizedException
} from '@nestjs/common';
import * as passport from 'passport';
import { Type } from './interfaces';
import { AuthModuleOptions } from './interfaces/auth-module.options';
import { defaultOptions } from './options';
import { memoize } from './utils/memoize.util';
import { isArray } from 'util';

export type IAuthGuard = CanActivate & {
  logIn<TRequest extends { logIn: Function } = any>(
    request: TRequest
  ): Promise<void>;
  handleRequest<TUser = any>(err, user, info, context): TUser;
};
export const AuthGuard: (
  type?: string | string[],
  excludes?: string | string[]
) => Type<IAuthGuard> = memoize(createAuthGuard);

const NO_STRATEGY_ERROR = `In order to use "defaultStrategy", please, ensure to import PassportModule in each place where AuthGuard() is being used. Otherwise, passport won't work correctly.`;

function createAuthGuard(
  type?: string | string[],
  excludes?: string | string[]
): Type<CanActivate> {
  class MixinAuthGuard<TUser = any> implements CanActivate {
    excludes: RegExp[] = [];
    constructor(@Optional() protected readonly options?: AuthModuleOptions) {
      this.options = this.options || {};
      if (!type && !this.options.defaultStrategy) {
        new Logger('AuthGuard').error(NO_STRATEGY_ERROR);
      }
      if (isArray(excludes)) {
        this.excludes = excludes.map(e => new RegExp(e));
      } else if (excludes) {
        this.excludes = [new RegExp(excludes)];
      }
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const options = { ...defaultOptions, ...this.options };
      const [request, response] = [
        this.getRequest(context),
        context.switchToHttp().getResponse()
      ];

      // if excludes matches, no further auth check
      if (this.excludes.some(e => e.test(request.path))) {
        return true;
      }

      const passportFn = createPassportContext(request, response);
      const user = await passportFn(
        type || this.options.defaultStrategy,
        options,
        (err, user, info) => this.handleRequest(err, user, info, context)
      );
      request[options.property || defaultOptions.property] = user;
      return true;
    }

    getRequest<T = any>(context: ExecutionContext): T {
      return context.switchToHttp().getRequest();
    }

    async logIn<TRequest extends { logIn: Function } = any>(
      request: TRequest
    ): Promise<void> {
      const user = request[this.options.property || defaultOptions.property];
      await new Promise((resolve, reject) =>
        request.logIn(user, err => (err ? reject(err) : resolve()))
      );
    }

    handleRequest(err, user, info, context): TUser {
      if (err || !user) {
        throw err || new UnauthorizedException();
      }
      return user;
    }
  }
  const guard = mixin(MixinAuthGuard);
  return guard;
}

const createPassportContext = (request, response) => (
  type,
  options,
  callback: Function
) =>
  new Promise((resolve, reject) =>
    passport.authenticate(type, options, (err, user, info) => {
      try {
        request.authInfo = info;
        return resolve(callback(err, user, info));
      } catch (err) {
        reject(err);
      }
    })(request, response, err => (err ? reject(err) : resolve))
  );
