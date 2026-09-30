import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function runSocialTests(sql) {
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const j = (value) => `${q(JSON.stringify(value))}::jsonb`;
  const user = async () => {
    const id = randomUUID();
    await sql(`insert into auth.users(id) values(${q(id)});`, null);
    await sql(`select sq_upsert_profile(${q(id)},'{}');`);
    return id;
  };
  const [first, second, third] = await Promise.all([user(), user(), user()]);
  const input = (username, expectedVersion = 0) => ({
    username,
    displayName: username,
    avatarKey: "coral",
    bio: "Public bio",
    openToBrands: true,
    expectedVersion,
  });
  const save = (actor, value) =>
    sql(`select sq_social_save(${q(actor)},${j(value)});`).then(JSON.parse);
  const read = (actor, target) =>
    sql(
      `select sq_social_read(${actor ? q(actor) : "null"},${q(target)});`,
    ).then(JSON.parse);
  const follow = (actor, target, following = true) =>
    sql(`select sq_social_follow(${q(actor)},${q(target)},${following});`).then(
      JSON.parse,
    );
  await save(first, input("first_creator"));
  await save(second, input("second_creator"));
  await assert.rejects(
    () => save(third, input("FIRST_CREATOR")),
    /username_taken/,
  );
  assert.equal(
    await sql(
      `select count(*) from creator_profiles where user_id=${q(third)};`,
    ),
    "0",
    "Username collision rolls back the entire profile save",
  );
  await assert.rejects(() => save(third, input("admin")), /invalid_username/);
  await save(third, input("third_creator"));
  await Promise.all([follow(first, second), follow(first, second)]);
  assert.equal((await read(null, second)).followersCount, 1);
  assert.equal((await read(first, first)).followingCount, 1);
  assert.equal((await read(first, second)).isFollowing, true);
  assert.equal((await read(null, second)).isFollowing, false);
  await assert.rejects(() => follow(first, first), /self_follow/);
  await follow(first, second, false);
  assert.equal((await read(null, second)).followersCount, 0);
  await follow(first, second);
  await follow(second, first);
  await sql(
    `insert into community_blocks(owner_id,blocked_id) values(${q(first)},${q(second)});`,
  );
  assert.equal(
    await sql(
      `select count(*) from creator_follows where follower_id in (${q(first)},${q(second)});`,
    ),
    "0",
  );
  await assert.rejects(() => read(first, second), /not_found/);
  await assert.rejects(() => follow(second, first), /not_found/);
  await sql(`delete from community_blocks where owner_id=${q(first)};`);
  assert.equal(
    (await read(first, second)).isFollowing,
    false,
    "Unblocking never restores a removed follow",
  );
  const photo1 = `avatars/${first}/${randomUUID()}.png`,
    photo2 = `avatars/${first}/${randomUUID()}.png`;
  await sql(`select sq_social_photo(${q(first)},${q(photo1)});`);
  const dto = await read(null, first);
  assert.match(dto.photoUrl, new RegExp(`/api/social/photo/${first}`));
  assert.ok(!JSON.stringify(dto).includes("avatars/"));
  const community = JSON.parse(
    await sql(`select private.community_creator(${q(first)});`),
  );
  assert.equal(community.username, "first_creator");
  assert.equal(community.photoUrl, dto.photoUrl);
  await assert.rejects(
    () =>
      sql(
        `select sq_social_photo(${q(first)},${q(`avatars/${second}/${randomUUID()}.png`)});`,
      ),
    /invalid_photo/,
  );
  await sql(`select sq_social_photo(${q(first)},${q(photo2)});`);
  assert.equal(
    await sql(
      `select count(*) from social_photo_cleanup where object_key=${q(photo1)};`,
    ),
    "1",
  );
  await sql(`select sq_social_photo(${q(first)},null);`);
  assert.equal((await read(null, first)).photoUrl, null);
  assert.equal(
    await sql(
      `select count(*) from social_photo_cleanup where object_key=${q(photo2)};`,
    ),
    "1",
  );
  const photo3 = `avatars/${first}/${randomUUID()}.png`;
  await sql(`select sq_social_photo(${q(first)},${q(photo3)});`);
  await follow(first, second);
  await sql(
    `update profiles set account_status='deleting' where id=${q(first)};`,
  );
  await assert.rejects(() => read(null, first), /not_found/);
  assert.equal((await read(null, second)).followersCount, 0);
  assert.equal(
    await sql(
      `select count(*) from social_photo_cleanup where object_key=${q(photo3)};`,
    ),
    "1",
  );
  for (const role of ["anon", "authenticated"]) {
    for (const table of [
      "social_profiles",
      "creator_follows",
      "social_photo_cleanup",
    ])
      await assert.rejects(
        () => sql(`select * from ${table};`, role),
        /permission denied/,
      );
    await assert.rejects(
      () => sql(`select sq_social_read(null,${q(second)});`, role),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        sql(`select sq_social_follow(${q(third)},${q(second)},true);`, role),
      /permission denied/,
    );
  }
  console.log(
    "Social identity, unique usernames, follow/block counts, photo retirement, account deletion, and service-only permissions passed.",
  );
}
