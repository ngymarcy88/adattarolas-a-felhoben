import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { MultipartController, MultipartGuard } from '../src/multipart/multipart.controller';
import { MultipartFilePipe, pageInput, pageCursor, source, uuid } from '../src/multipart/multipart.dto';
import { MultipartLimits } from '../src/multipart/multipart.limit';
import { SessionGuard } from '../src/auth/session.guard';
import { OriginGuard } from '../src/auth/origin.guard';
import { FilesController } from '../src/files/files.controller';
import { multipartFixture, multipartOwner as owner, hash, image } from './helpers/multipart-fixture';
import { validateEnvironment } from '../src/config/environment';

it.each(['create','initiate','sign','resume','complete','cancel'] as const)('protects %s with Origin then current session then bounded request guard',method=>{
  const handler=MultipartController.prototype[method];expect(Reflect.getMetadata(GUARDS_METADATA,handler)).toEqual([OriginGuard,SessionGuard,MultipartGuard]);
  expect(Reflect.getMetadata(HTTP_CODE_METADATA,handler)).toBe(200);
});
it.each(['get','list','status'] as const)('protects read %s with current user',method=>{
  expect(Reflect.getMetadata(GUARDS_METADATA,MultipartController.prototype[method])).toEqual([SessionGuard,MultipartGuard]);
});
it('thin controller passes only the authenticated owner and does not accept a complete manifest',async()=>{
  const imports={create:jest.fn().mockResolvedValue({status:201,body:{import:{id:owner}}})};const transfers={complete:jest.fn().mockResolvedValue({status:202,body:{transfer:{id:owner}}})};
  const controller=new MultipartController(imports as never,transfers as never);const response={setHeader:jest.fn(),status:jest.fn(),json:jest.fn()};response.status.mockReturnValue(response);
  await controller.create({user:{id:owner}} as never,owner,{},response as never);expect(imports.create).toHaveBeenCalledWith(owner,owner);
  await controller.complete({user:{id:owner}} as never,owner,{},response as never);expect(transfers.complete).toHaveBeenCalledWith(owner,owner);
  expect(response.status).toHaveBeenCalledWith(202);expect(response.setHeader).toHaveBeenCalledWith('Retry-After','2');
  await expect(controller.complete({user:{id:owner}} as never,owner,{parts:[]},response as never)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
it('dispatches multipart confirm without invoking the single-PUT verifier',async()=>{
  const legacy={confirm:jest.fn()};const multipart={confirmFile:jest.fn().mockResolvedValue({status:202,body:{transfer:{id:owner}}})};
  const controller=new FilesController(undefined as never,legacy as never,undefined as never,undefined as never,multipart as never);
  const response={setHeader:jest.fn(),status:jest.fn(),json:jest.fn()};response.status.mockReturnValue(response);
  await controller.confirm({user:{id:owner},requestId:'synthetic-request'} as never,owner,response as never);
  expect(multipart.confirmFile).toHaveBeenCalledWith(owner,owner,'synthetic-request');expect(legacy.confirm).not.toHaveBeenCalled();
});
it('keeps single-PUT confirm on the existing service',async()=>{
  const legacy={confirm:jest.fn().mockResolvedValue({file:{id:owner}})};const multipart={confirmFile:jest.fn().mockResolvedValue(null)};
  const controller=new FilesController(undefined as never,legacy as never,undefined as never,undefined as never,multipart as never);
  const response={status:jest.fn(),json:jest.fn()};response.status.mockReturnValue(response);
  await controller.confirm({user:{id:owner}} as never,owner,response as never);expect(legacy.confirm).toHaveBeenCalledTimes(1);
});
it('validates JSON/query and sets Retry-After on bounded requests',()=>{
  const limits=new MultipartLimits();const guard=new MultipartGuard(new Reflector(),limits);const response={setHeader:jest.fn()};
  const request:any={user:{id:owner},method:'POST',headers:{'content-type':'application/json'},query:{},body:{}};
  const context:any={getHandler:()=>MultipartController.prototype.complete,switchToHttp:()=>({getRequest:()=>request,getResponse:()=>response})};
  for(let i=0;i<20;i++)expect(guard.canActivate(context)).toBe(true);
  expect(()=>guard.canActivate(context)).toThrow(expect.objectContaining({code:'RATE_LIMITED'}));expect(response.setHeader).toHaveBeenCalledWith('Retry-After',expect.any(String));
});
it.each([
  {sizeBytes:0,contentSha256:hash},{sizeBytes:1.5,contentSha256:hash},{sizeBytes:image.length,contentSha256:'F'.repeat(64)},{sizeBytes:image.length,contentSha256:hash+'\n'},
  {sizeBytes:image.length,contentSha256:hash,ownerId:owner},
])('rejects malformed source identity %#',input=>{expect(()=>source(input)).toThrow(expect.objectContaining({code:'VALIDATION_ERROR'}));});
it.each(['id',owner+'\n',owner.toUpperCase()+'\n'])('rejects malformed IDs %#',id=>expect(()=>uuid(id)).toThrow());
it('reuses image normalization and rejects extra authority fields',()=>{
  const f=multipartFixture();const pipe=new MultipartFilePipe(f.config);const input=f.input({originalName:'  á.png  '});expect(pipe.transform(input).originalName).toBe('á.png');
  expect(()=>pipe.transform({...input,storageKey:'forged'})).toThrow();expect(()=>pipe.transform({...input,mimeType:'image/svg+xml'})).toThrow();
});
it('validates bounded cursor scope/shape for both directions',()=>{
  const cursor=pageCursor(owner,'imports',owner,'2026-11-02T10:00:00.000Z');expect(pageInput({cursor,limit:'1'},owner,'imports').limit).toBe(1);
  expect(()=>pageInput({cursor},owner,'different-import')).toThrow();expect(()=>pageInput({limit:'51'},owner,'imports')).toThrow();
  expect(()=>pageInput({cursor:cursor+'='},owner,'imports')).toThrow();expect(()=>pageInput({limit:['1']},owner,'imports')).toThrow();
});
it.each([['MULTIPART_PART_SIZE_BYTES','5242881'],['MULTIPART_PART_SIZE_BYTES','1048576'],['MULTIPART_URL_TTL_SECONDS','301'],['MULTIPART_SESSION_TTL_SECONDS','86401'],['MULTIPART_MAX_FILES_PER_IMPORT','51']])('config rejects %s=%s', (name,value)=>{
  expect(()=>validateEnvironment({[name]:value})).toThrow(expect.objectContaining({message:expect.stringContaining(name)}));
});

it.each(['1\n','01','1.0','21','0'])('rejects noncanonical part path %j before signing',part=>{
  const transfers={sign:jest.fn()};const controller=new MultipartController(undefined as never,transfers as never);
  expect(()=>controller.sign({user:{id:owner}} as never,owner,part,{})).toThrow(expect.objectContaining({code:'VALIDATION_ERROR'}));expect(transfers.sign).not.toHaveBeenCalled();
});
