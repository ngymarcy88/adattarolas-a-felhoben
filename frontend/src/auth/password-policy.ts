/** Registration policy only. Existing passwords remain valid for login. */
export function passwordRequirements(password: string) {
  return [
    { key: 'length', label: 'Legalább 15 karakter', met: Array.from(password).length >= 15 },
    { key: 'uppercase', label: 'Legalább egy nagybetű', met: /\p{Lu}/u.test(password) },
    { key: 'number', label: 'Legalább egy számjegy', met: /\p{Nd}/u.test(password) },
    { key: 'special', label: 'Legalább egy speciális karakter (például !, @, #)', met: /[\p{P}\p{S}]/u.test(password) },
  ];
}
