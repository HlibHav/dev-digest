import { describe, it, expect } from 'vitest';
import { parseRepoUrl } from '../src/modules/repos/helpers.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

/**
 * Clone-destination safety. `parseRepoUrl`'s output becomes a path under the
 * clone dir (`<cloneDir>/<owner>/<repo>`), and `SimpleGitClient.clone` deletes a
 * destination that exists without a `.git` — so an `owner` of `..` was a
 * recursive delete outside the clone dir, reachable from an unauthenticated
 * `POST /repos`. Two independent gates: reject the segment, and refuse the path.
 */

describe('parseRepoUrl', () => {
  it('parses the two documented URL forms', () => {
    expect(parseRepoUrl('https://github.com/acme/widget')).toEqual({
      owner: 'acme',
      name: 'widget',
    });
    expect(parseRepoUrl('https://github.com/acme/widget.git')).toEqual({
      owner: 'acme',
      name: 'widget',
    });
    expect(parseRepoUrl('https://www.github.com/acme/widget/')).toEqual({
      owner: 'acme',
      name: 'widget',
    });
    expect(parseRepoUrl('git@github.com:acme/widget.git')).toEqual({
      owner: 'acme',
      name: 'widget',
    });
  });

  it('rejects a traversal segment instead of parsing it as an owner', () => {
    expect(() => parseRepoUrl('https://github.com/../src')).toThrow(/Illegal owner\/repo segment/);
    expect(() => parseRepoUrl('https://github.com/./src')).toThrow(/Illegal owner\/repo segment/);
  });

  it('rejects a host that merely ends with a github.com path', () => {
    // Unanchored, this parsed as acme/widget and was handed to `git clone`.
    expect(() => parseRepoUrl('https://evil.example/x/github.com/acme/widget')).toThrow(
      /Could not parse owner\/repo/,
    );
  });
});

describe('SimpleGitClient.clonePathFor', () => {
  const git = new SimpleGitClient('/tmp/devdigest-clones');

  it('joins owner and name under the clone dir', () => {
    expect(git.clonePathFor({ owner: 'acme', name: 'widget' })).toBe(
      '/tmp/devdigest-clones/acme/widget',
    );
  });

  it('refuses a destination that escapes the clone dir', () => {
    expect(() => git.clonePathFor({ owner: '..', name: 'src' })).toThrow(
      /Refusing a clone path outside the clone dir/,
    );
  });
});
